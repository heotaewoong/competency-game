import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'mode',
          message: '게임 모드는 전역 window.mode가 아니라 SessionModeContext에서 읽어야 합니다.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    '.vinext/**',
    '.wrangler/**',
    'dist/**',
    'out/**',
    'build/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
