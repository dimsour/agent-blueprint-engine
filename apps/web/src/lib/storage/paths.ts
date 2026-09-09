/**
 * Where a project's manifest lives inside a file map.
 *
 * One constant, because three different places need to answer "are these files already a
 * project, or are they wrapped in a folder": the archive unwrapper, the manifest import,
 * and anything that has to decide before parsing.
 */
export const MANIFEST_PATH = 'blueprint/blueprint.yaml'
