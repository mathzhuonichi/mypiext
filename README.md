# mypiext

A modular Pi coding agent extension for a quieter terminal and a few familiar controls. It uses Pi's extension APIs and does not patch Pi's installed source.

## Features

- **Tool display:** tool calls and results are hidden by default; `Ctrl+O` reveals them.
- **`/effort`:** select a supported thinking level with a color-coded interface, or use `/effort high` to set one directly. Pi's built-in `/thinking` remains unchanged.
- **Working indicator:** a small animated indicator and elapsed time while Pi works.
- **Status line:** model, thinking level, cache-read share, context use, and output speed.
- **Claude-style commands:** `/clear`, `/exit`, `/rename`, `/rewind`, `/context`, `/cost`, `/status`, `/memory`, `/init`, and `/help`. `/rewind` changes the conversation position; it does not revert files.

Elapsed time covers the whole exchange, including retries and automatic continuation, and resets once Pi settles. Some UI features require Pi's interactive terminal mode.

## Install

Install from the repository's GitHub URL with Pi's package manager:

```sh
pi install git:github.com/OWNER/mypiext
```

Replace `OWNER` with the repository owner. Restart Pi or run `/reload` after installation. Review extension code before installing it: extensions run with the same permissions as Pi.

## Development

`index.js` registers the independent files under `modules/`. Comment out a module's registration in `index.js` and reload Pi to disable that feature.

For tests, provide the host packages listed in `peerDependencies` in the local Node module resolution path, then run:

```sh
npm test
```

The extension relies on Pi APIs including `registerToolRenderer` and `setWorkingIndicator`; compatibility depends on the installed Pi version.
