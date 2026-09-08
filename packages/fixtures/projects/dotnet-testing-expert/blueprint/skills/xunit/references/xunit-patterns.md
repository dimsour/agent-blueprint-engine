# xUnit patterns

## Shared context

- `IClassFixture<T>`: one instance per test class.
- `ICollectionFixture<T>` + `[Collection("name")]`: one instance across several classes.

## Parameterised tests

- `[InlineData]` for literals, `[MemberData]` for computed cases, `[ClassData]` for reusable sets.
