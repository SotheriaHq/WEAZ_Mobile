module.exports = {
  root: true,
  extends: ['expo'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native',
            importNames: ['Text'],
            message: 'Please use AppText from @/components/ui/AppText instead of raw Text from react-native. Raw Text causes synthetic boldness and inconsistent typography.',
          },
          {
            name: 'react-native',
            importNames: ['Image'],
            message: 'Please use StableImage or the approved image-system primitives instead of raw Image from react-native.',
          },
          {
            name: 'react-native',
            importNames: ['TextInput'],
            message: 'Please use the shared Input component from @/components/ui/Input instead of raw TextInput from react-native.',
          },
        ],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "Property[key.name=/^(fontSize|fontWeight|lineHeight)$/]",
        message:
          'Typography literals are forbidden in mobile product UI. Use AppText variants and typography tokens.',
      },
      {
        selector:
          "Property[key.name='color'][value.type='Literal']",
        message:
          'Hardcoded colors are forbidden in mobile product UI. Use theme tokens and AppText tone props.',
      },
      {
        selector:
          "Property[key.name=/^(backgroundColor|borderColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor)$/][value.type='Literal']",
        message:
          'Hardcoded colors are forbidden in mobile product UI. Use theme tokens only.',
      },
      {
        selector:
          "Property[key.name=/^(margin|marginTop|marginRight|marginBottom|marginLeft|marginHorizontal|marginVertical|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|paddingHorizontal|paddingVertical|gap|rowGap|columnGap)$/][value.type='Literal']",
        message:
          'Spacing literals are forbidden in mobile product UI. Use spacing tokens only.',
      },
      {
        selector:
          "FunctionDeclaration[id.name=/^(TabBar|Tabs|Header|Card|Button|Input)$/]",
        message:
          'Do not recreate local design-system primitives. Use the approved shared mobile UI components.',
      },
      {
        selector:
          "VariableDeclarator[id.name=/^(TabBar|Tabs|Header|Card|Button|Input)$/]",
        message:
          'Do not recreate local design-system primitives. Use the approved shared mobile UI components.',
      },
    ],
  },
  overrides: [
    {
      files: ['src/styles/tokens.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    {
      files: ['components/ui/AppText.tsx'],
      rules: {
        'no-restricted-imports': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    {
      files: ['components/ui/**/*.tsx', 'components/catalog/Tabs.tsx', 'components/ui/WeazLogo.tsx'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    {
      files: [
        'components/ui/Input.tsx',
        'components/ui/StableImage.tsx',
        'components/ui/WeazLogo.tsx',
        'components/catalog/CollectionDetailViewer.tsx',
        'app/(tabs)/index.tsx',
      ],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
