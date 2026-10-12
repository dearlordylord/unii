# npm package preparation and release

Package: `@dearlordylord/unii`, version `0.1.0`, public ESM with TypeScript declarations. Source repository: https://github.com/dearlordylord/unii. The scope follows the existing GitHub handle; ownership of that npm scope must be verified with the publishing account.

Package fields and lifecycle configuration follow the [official npm package.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

## Validate

```sh
git submodule update --init
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

The package smoke check creates a real tarball, verifies its notices and documentation, installs it into a temporary project and checks both TypeScript declarations and the runtime public API. The artifact includes `dist`, `spec`, `docs`, README and license notices. Reference checkouts, tests, development scripts and node_modules are excluded. `prepack` builds JavaScript and declarations; `prepublishOnly` runs the complete validation including the pinned Lisp oracle.

## Local integration

Run `npm pack`, then install the resulting tarball in the consuming project. For active development, run `npm link` here and `npm link @dearlordylord/unii` in the consumer; rebuild with `npm run build` after changes. Neither command publishes a package.

## Publish when requested

```sh
git clone --recurse-submodules https://github.com/dearlordylord/unii.git
cd unii
npm ci --ignore-scripts
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish --dry-run
npm publish --access public
```

Use Node.js 22 or later and Emacs 29.1 or later: the publication hook runs the full checks, including the Lisp oracle. If the repository is already checked out, pull the latest main and initialize its submodules instead of cloning again.

Publishing requires an authenticated account that controls the selected scope. For a personal scope, `npm whoami` must report `dearlordylord`. If it reports another username, change the package scope to that username before publishing, or use an organization scope you control. Complete npm's browser login and enable account 2FA for direct publication; respond to any verification prompt. The initial package preparation did not publish anything, reserve the name or verify npm scope ownership. Subsequent releases need a new version and refreshed evidence for changed behavior.
