'use client'

/**
 * Where the assistant gets its answers.
 *
 * Bring your own endpoint: this is a form for a base URL, a model and a key, and the product
 * has no opinion about which. What it does have an opinion about is telling the truth — so
 * "Save and test" actually calls the endpoint, and what comes back is shown as it is. A model
 * name that does not exist, a key that has expired and a local server that is not running all
 * look identical until something asks, and the moment to find out is here rather than halfway
 * through generating a Blueprint.
 *
 * The key is treated as what it is. It goes to one module, never into the store, never into a
 * project, and where it is kept is the user's decision made before it is written, with the
 * consequence stated in full (docs/08-security.md).
 */
import {
  AI_PRESETS,
  AI_PRESET_IDS,
  createAIClient,
  type PresetId,
  type ProbeResult,
} from '@agent-blueprint/ai'
import { CheckIcon, KeyRoundIcon, Loader2Icon, SquareIcon, XIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Elapsed } from '@/components/ai/waiting'
import { Field, TextField } from '@/components/editors/fields'
import { Button } from '@/components/ui/button'
import { Badge, Card, Input } from '@/components/ui/primitives'
import { describeFailure, wasStopped } from '@/lib/ai/failure'
import { useClientValue } from '@/lib/client-value'
import {
  clientConfig,
  DEFAULT_AI_SETTINGS,
  readAISettings,
  settingsForPreset,
  writeAISettings,
  type AISettings,
} from '@/lib/ai/settings'
import {
  forgetCredential,
  maskCredential,
  readCredential,
  STORAGE_WARNING,
  writeCredential,
  type CredentialStorage,
} from '@/lib/credentials'

interface StoredState {
  settings: AISettings
  where: CredentialStorage
  key?: string
}

const EMPTY_STATE = JSON.stringify({
  settings: DEFAULT_AI_SETTINGS,
  where: 'session',
} satisfies StoredState)

/** One string, so `useClientValue` has something stable to compare between renders. */
function readStoredState(): string {
  const credential = readCredential('ai')
  return JSON.stringify({
    settings: readAISettings(),
    where: credential?.where ?? 'session',
    ...(credential ? { key: credential.value } : {}),
  } satisfies StoredState)
}

const STORAGE_LABELS: Record<CredentialStorage, string> = {
  session: 'Until this tab closes',
  local: 'In this browser, until removed',
}

export function AISettings() {
  const presetId = useId()
  const keyId = useId()
  const storageId = useId()
  const proxyId = useId()
  const timeoutId = useId()
  const streamId = useId()

  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS)
  const [where, setWhere] = useState<CredentialStorage>('session')
  const [stored, setStored] = useState<string | undefined>()
  const [key, setKey] = useState('')
  const [probe, setProbe] = useState<ProbeResult | undefined>()
  const [testing, setTesting] = useState(false)
  const [testingSince, setTestingSince] = useState<number | undefined>()
  // Held across renders rather than in state: stopping must not wait for one.
  const inFlight = useRef<AbortController | undefined>(undefined)

  // Web storage does not exist while this renders on the server, so the first HTML is the
  // defaults and the first client render corrects it. Going through a string keeps the
  // snapshot comparison stable; adopting it during render is the pattern React documents for
  // state derived from something outside, and the one the form fields here already use.
  const hydrated = useClientValue(readStoredState, EMPTY_STATE)
  const [adopted, setAdopted] = useState(EMPTY_STATE)
  if (hydrated !== adopted) {
    setAdopted(hydrated)
    const state = JSON.parse(hydrated) as StoredState
    setSettings(state.settings)
    setWhere(state.where)
    setStored(state.key)
  }

  const preset = AI_PRESETS[settings.presetId]
  const change = (next: Partial<AISettings>) => {
    setSettings((current) => ({ ...current, ...next }))
    setProbe(undefined)
  }

  const save = async () => {
    const apiKey = key || stored
    if (key) {
      writeCredential('ai', key, where)
      setStored(key)
      setKey('')
    }
    const controller = new AbortController()
    inFlight.current = controller
    setTesting(true)
    setTestingSince(Date.now())
    try {
      const result = await createAIClient(clientConfig(settings, apiKey)).probe({
        signal: controller.signal,
      })
      setProbe(result)
      // What the probe found about schema support is worth more than what we assumed, and
      // storing it here is what keeps every later call from having to discover it again.
      const settled = { ...settings, jsonSchema: result.jsonSchema }
      setSettings(settled)
      writeAISettings(settled)
      if (result.reachable && result.authenticated) toast.success('The endpoint answered.')
      else toast.error(result.error?.message ?? 'The endpoint did not answer.')
    } catch (error) {
      // Stopping is a decision, not a failure. Anything else is worth reporting: this button
      // exists to find out whether the endpoint answers, so silence is the wrong answer.
      if (!wasStopped(error)) {
        const failure = describeFailure(error)
        toast.error(failure.message, failure.hint ? { description: failure.hint } : {})
      }
    } finally {
      inFlight.current = undefined
      setTesting(false)
      setTestingSince(undefined)
    }
  }

  const forget = () => {
    forgetCredential('ai')
    setStored(undefined)
    setKey('')
    setProbe(undefined)
    toast.success('Removed the key from this browser.')
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <Field label="Provider" htmlFor={presetId} help={preset.note}>
        <select
          id={presetId}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={settings.presetId}
          onChange={(event) => change(settingsForPreset(event.target.value as PresetId, settings))}
        >
          {AI_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {AI_PRESETS[id].name}
            </option>
          ))}
        </select>
      </Field>

      <TextField
        label="Base URL"
        value={settings.baseUrl}
        onChange={(baseUrl) => change({ baseUrl })}
        placeholder="https://api.openai.com/v1"
        mono
        help="Everything before /chat/completions."
      />

      <TextField
        label="Model"
        value={settings.model}
        onChange={(model) => change({ model })}
        placeholder="gpt-5-mini"
        mono
        {...(probe && probe.models.length > 0
          ? { help: `This endpoint offers: ${probe.models.slice(0, 8).join(', ')}` }
          : {})}
      />

      <label htmlFor={streamId} className="flex items-start gap-2 text-sm">
        <input
          id={streamId}
          type="checkbox"
          className="mt-0.5"
          checked={settings.stream}
          onChange={(event) => change({ stream: event.target.checked })}
        />
        <span>
          Stream the answer
          <span className="text-muted-foreground block text-xs">
            The answer arrives in pieces, so you can see it being written and stop it part way.
            Leave it on unless the endpoint refuses to stream: with it off, nothing arrives until
            the model has finished, and the wait below becomes a cap on how long it may take.
          </span>
        </span>
      </label>

      <Field
        label={settings.stream ? 'Give up after silence of' : 'Wait for an answer'}
        htmlFor={timeoutId}
        help={
          settings.stream
            ? 'How long to wait with nothing arriving. A model may take as long as it likes so long as it keeps writing, so this only has to cover the pause before it starts — and it is what tells a slow model apart from a dead connection.'
            : 'The whole answer, because nothing arrives until the model has finished. A hosted API answers in seconds; a local model drafting a whole Blueprint can take many minutes, and everything past this is reported as a failure however well it was going.'
        }
      >
        <div className="flex items-center gap-2">
          <Input
            id={timeoutId}
            type="number"
            min={5}
            max={3600}
            className="w-24"
            value={Math.round(settings.timeoutMs / 1000)}
            onChange={(event) => {
              const seconds = Number(event.target.value)
              if (Number.isFinite(seconds) && seconds > 0) change({ timeoutMs: seconds * 1000 })
            }}
          />
          <span className="text-muted-foreground text-sm">seconds</span>
        </div>
      </Field>

      <Field
        label="API key"
        htmlFor={keyId}
        help={
          stored
            ? `A key is stored: ${maskCredential(stored)}. Type a new one to replace it.`
            : preset.requiresKey
              ? 'This provider needs one.'
              : 'A local server usually needs none.'
        }
      >
        <Input
          id={keyId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          placeholder={stored ? '••••••••' : 'sk-…'}
          onChange={(event) => setKey(event.target.value)}
        />
      </Field>

      <Field label="Keep the key" htmlFor={storageId}>
        <select
          id={storageId}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={where}
          onChange={(event) => setWhere(event.target.value as CredentialStorage)}
        >
          {(['session', 'local'] as const).map((option) => (
            <option key={option} value={option}>
              {STORAGE_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>

      {where === 'local' ? (
        <p role="note" className="text-muted-foreground border-l-2 pl-3 text-xs">
          {STORAGE_WARNING}
        </p>
      ) : null}

      {!preset.requiresKey ? (
        <label htmlFor={proxyId} className="flex items-start gap-2 text-sm">
          <input
            id={proxyId}
            type="checkbox"
            className="mt-0.5"
            checked={settings.viaProxy}
            onChange={(event) => change({ viaProxy: event.target.checked })}
          />
          <span>
            Relay through this app
            <span className="text-muted-foreground block text-xs">
              For a local endpoint that refuses the browser. The relay only reaches hosts this
              deployment allows, localhost by default.
            </span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save()} disabled={testing || !settings.baseUrl}>
          {testing ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
          {testing ? 'Testing…' : 'Save and test'}
        </Button>
        {testing ? (
          <Button variant="outline" onClick={() => inFlight.current?.abort()}>
            <SquareIcon />
            Stop
          </Button>
        ) : null}
        {stored ? (
          <Button variant="outline" onClick={forget}>
            Forget key
          </Button>
        ) : null}
        {/* No token count to show — a probe is a model list and one tiny completion — but
            "nothing has happened for forty seconds" is still what the user needs to know. */}
        {testingSince !== undefined ? <Elapsed since={testingSince} /> : null}
      </div>

      {probe ? <ProbeSummary result={probe} /> : null}
    </Card>
  )
}

/** What the endpoint actually said, in the terms that decide whether the assistant works. */
function ProbeSummary({ result }: { result: ProbeResult }) {
  const rows: { label: string; ok: boolean; detail?: string }[] = [
    { label: 'Reachable', ok: result.reachable },
    { label: 'Key accepted', ok: result.authenticated },
    {
      label: 'Structured output',
      ok: result.jsonSchema,
      detail: result.jsonSchema
        ? 'Schemas are enforced by the endpoint.'
        : 'Schemas will be asked for in the prompt and checked here.',
    },
  ]
  return (
    <div className="flex flex-col gap-1.5" aria-label="Endpoint test">
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 text-sm">
          <span className={row.ok ? 'text-emerald-600' : 'text-muted-foreground'}>
            {row.ok ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
          </span>
          <span>{row.label}</span>
          {row.detail ? <span className="text-muted-foreground text-xs">{row.detail}</span> : null}
        </p>
      ))}
      {result.error ? (
        <p className="text-sm">
          <Badge variant="outline">{result.error.code}</Badge>{' '}
          <span className="text-muted-foreground">{result.error.message}</span>
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">Answered in {result.latencyMs} ms.</p>
      )}
    </div>
  )
}
