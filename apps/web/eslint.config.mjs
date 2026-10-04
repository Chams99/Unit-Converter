import nextConfig from 'eslint-config-next/core-web-vitals';

export default [
  ...nextConfig,
  {
    ignores: ['.next/**', '.next-*/**', 'node_modules/**'],
  },
  {
    rules: {
      'import/no-anonymous-default-export': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
