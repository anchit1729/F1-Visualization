module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  extends: ['airbnb', 'airbnb/hooks', 'prettier'],
  plugins: ['react-native'],
  settings: {
    react: {
      version: '19.2',
    },
  },
  rules: {
    'react/function-component-definition': [
      'error',
      {
        namedComponents: 'function-declaration',
        unnamedComponents: 'arrow-function',
      },
    ],
    'react/jsx-filename-extension': [
      'error',
      {
        extensions: ['.jsx', '.tsx'],
      },
    ],
    'react/react-in-jsx-scope': 'off',
    'react-native/no-unused-styles': 'error',
    'react-native/split-platform-components': 'error',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      plugins: ['@typescript-eslint', 'react-native'],
      settings: {
        'import/resolver': {
          node: {
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
          },
        },
        react: {
          version: '19.2',
        },
      },
      extends: [
        'airbnb',
        'airbnb/hooks',
        'plugin:@typescript-eslint/recommended-type-checked',
        'prettier',
      ],
      rules: {
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            ts: 'never',
            tsx: 'never',
          },
        ],
        'import/prefer-default-export': 'off',
        'no-unused-vars': 'off',
        'no-use-before-define': [
          'error',
          {
            classes: true,
            functions: false,
            variables: false,
          },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
          },
        ],
        'react/prop-types': 'off',
        'react/jsx-filename-extension': [
          'error',
          {
            extensions: ['.jsx', '.tsx'],
          },
        ],
        'react/react-in-jsx-scope': 'off',
        'react/require-default-props': 'off',
        'react/style-prop-object': 'off',
      },
    },
    {
      files: ['*.config.js', '*.config.cjs', '*.config.mjs', '.eslintrc.cjs'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['**/*.test.*', '**/tests/**/*'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};
