// Replaces whole methods of vendored Consent-O-Matic rules by name, so fixes
// stay in data/consent-o-matic-overrides.json and survive re-vendoring.
//
// Current overrides:
// - cookiebot SAVE_CONSENT: upstream clicks "Allow selection" and then
//   "Deny" while the dialog fades out, which saves reject-all whatever the
//   user's categories are. The override stops after "Allow selection".
export const applyOverrides = (rules, overrides) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => {
      const override = overrides[name];
      if (!override) return [name, rule];
      const replaced = new Map(
        override.methods.map((method) => [method.name, method]),
      );
      return [name, {
        ...rule,
        methods: rule.methods.map((method) =>
          replaced.get(method.name) ?? method
        ),
      }];
    }),
  );
