import base from '@shifo/config/eslint';

export default [
  ...base,
  {
    // Next.js and Tailwind config files are not part of the TS project graph in a useful way.
    ignores: ['postcss.config.mjs'],
  },
];
