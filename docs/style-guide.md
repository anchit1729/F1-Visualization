# React and TypeScript style guide

## Status

Accepted for the project foundation. Review this document when upgrading Expo, React, TypeScript, ESLint, or the Airbnb configuration.

## Baseline

The project follows the Airbnb JavaScript and React/JSX guides through pinned `eslint-config-airbnb` and `airbnb/hooks` rules. ESLint, strict TypeScript, and Prettier are mandatory CI checks with zero allowed lint warnings.

## TypeScript and React Native adaptations

- Use `.tsx` instead of `.jsx` for JSX-bearing TypeScript files.
- Explicit TypeScript prop types replace PropTypes. Default function parameters replace `defaultProps` on function components.
- React does not need to be imported solely to use JSX with the modern transform, so `react/react-in-jsx-scope` is disabled.
- New UI uses named function components and hooks. Class components require a concrete error-boundary or third-party API reason.
- React Native accessibility props are authoritative for universal components. Web-only ARIA belongs in `.web.tsx` adapters when React Native Web cannot express the required behavior.
- `react-native/no-unused-styles` and `react-native/split-platform-components` supplement the Airbnb rules.
- TypeScript files may reference module-level constants declared later in the file, which supports the standard React Native pattern of defining `StyleSheet` objects after their component. Classes must still be declared before use.
- `react/style-prop-object` is disabled because universal Expo components such as `StatusBar` intentionally accept documented string-valued `style` props.
- TypeScript modules may use a single named export for hooks and utilities; stable named imports are clearer than switching APIs between named and default form as a module grows.

## Local conventions

- Component files and references use PascalCase; variables, functions, and props use camelCase; hooks begin with `use`.
- Event implementations begin with `handle`; callback props begin with `on`.
- Lists use stable domain identifiers, never reorderable array indexes, as React keys.
- Use prop spreading only for an intentional, typed pass-through.
- Do not suppress hook dependency lint rules. Restructure the effect or selector.
- Keep render functions pure and isolate network, clock, storage, and haptic effects behind adapters.

## Exceptions

Inline disables must explain why the compatible Airbnb rule cannot apply and must cover the smallest possible scope. Repository-wide exceptions require an entry here. No repository-wide exceptions exist at foundation time beyond the TypeScript and React Native adaptations listed above.

## Commands

- `npm run lint` checks Airbnb-derived semantic and style rules.
- `npm run format:check` checks deterministic formatting.
- `npm run typecheck` runs strict TypeScript validation.
- `npm run ci` runs the complete local quality gate.
