import base from '@shifo/config/eslint';

export default [
  ...base,
  {
    // Tenant isolation: modules must use db.forTenant(); the unscoped client is for core/, CLI,
    // seeds and the auth module (login happens before the tenant is known).
    files: ['src/modules/**/*.ts'],
    ignores: ['src/modules/auth/**', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='system']",
          message: 'Use db.forTenant(clinicId); the unscoped client is not allowed in modules.',
        },
      ],
    },
  },
];
