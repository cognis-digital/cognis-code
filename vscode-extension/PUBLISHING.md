# Publishing Cognis Code to the VS Code Marketplace

This is the one step that needs **you** (a marketplace publisher + a token). ~10 minutes, once.

## 1. Create the `cognis-digital` publisher (once)
- Sign in at https://marketplace.visualstudio.com/manage with a Microsoft account.
- Create a publisher with **ID `cognis-digital`** (must match `"publisher"` in package.json).

## 2. Get a Personal Access Token (PAT)
- Go to https://dev.azure.com → your org → **User settings → Personal access tokens → New**.
- Organization: **All accessible organizations**. Scopes: **Marketplace → Manage**. Copy the token.

## 3. Publish
```bash
cd vscode-extension
npx --yes @vscode/vsce login cognis-digital      # paste the PAT
npm run publish                                    # builds + uploads
# or a specific bump:  npx @vscode/vsce publish minor
```
It appears at `https://marketplace.visualstudio.com/items?itemName=cognis-digital.cognis-code`.

## Local install (no marketplace needed)
```bash
npm run package                                    # -> cognis-code-0.1.0.vsix
code --install-extension cognis-code-0.1.0.vsix
```

## Notes
- The `.vsix` is git-ignored (build artifact). CI or `npm run package` regenerates it.
- Open VSX (for Cursor/VSCodium): `npx ovsx publish -p <openvsx-token>` after creating an open-vsx publisher.
- Bump `version` in package.json (or use `vsce publish patch|minor|major`) before each publish.
