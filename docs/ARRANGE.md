# Arrange compatibility

Mesurer Solid now presents this workflow as [Edit](./EDIT.md).

The `arrange()` plugin factory, `mesurer.arrange.*` state ids, persisted movement intent, `MesurerArrangeService`, and agent methods such as `arrangements()` and `reviewArrange()` remain supported. Existing integrations do not need a migration.

New application code should use `edit()` from `mesurer-solid/plugins` and the Edit terminology in the UI and documentation.

See [Edit](./EDIT.md) for movement, text editing, typography changes, presentation rules, and agent review.
