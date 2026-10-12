# npm package preparation and release

Package: `@dearlordylord/unii`, version `0.1.0`, public ESM with TypeScript declarations. The scope follows the existing GitHub handle; ownership of that npm scope must be verified with the publishing account. No remote repository URL is invented while this is a local repository.

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
npm whoami
npm publish --dry-run
npm publish --access public
```

Publishing requires an authenticated account that controls the selected scope. The initial package preparation did not publish anything, reserve the name or verify npm scope ownership. Add the actual Git repository URL to package metadata once that repository exists. Subsequent releases need a new version and refreshed evidence for changed behavior.
