# noimgur

[![mozilla add-on](https://img.shields.io/amo/v/noimgur-amo%40yobson.xyz?logo=firefoxbrowser&color=%23FF7139)](https://addons.mozilla.org/firefox/addon/noimgur/) [![edge add-on](https://img.shields.io/badge/dynamic/json?label=edge%20add-on&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Faefmjbiknjhljnlbeomiaggimjjgafpp)](https://microsoftedge.microsoft.com/addons/detail/noimgur/aefmjbiknjhljnlbeomiaggimjjgafpp) [![chrome web store](https://img.shields.io/chrome-web-store/v/bjofjgmleldgbcocnpejlgiklelnohnb?logo=chromewebstore&color=%234285F4)](https://chromewebstore.google.com/detail/bjofjgmleldgbcocnpejlgiklelnohnb)

[![GitHub License](https://img.shields.io/github/license/yobson1/noimgur)](https://github.com/yobson1/noimgur/blob/main/LICENSE)
[![WXT Badge](https://img.shields.io/badge/built_with-WXT-67D55E?logo=wxt&link=https%3A%2F%2Fwxt.dev%2F)](https://wxt.dev)

automatically redirect imgur images with a [rimgo](https://codeberg.org/rimgo/rimgo) instance

## Developing

This project uses [pnpm](https://pnpm.io/):

```sh
pnpm install
pnpm dev
pnpm dev:firefox
```

## Building

```sh
pnpm build
pnpm build:firefox
```

To create a bundled zip of the extension run:

```sh
pnpm zip
pnpm zip:firefox
```

The archive will be in the .output directory

## Screenshots
![Dark mode UI](media/screenshots/noimgur_dark.png)
![Light mode UI](media/screenshots/noimgur_light.png)

## Built With

- [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
- [![WXT](https://img.shields.io/badge/WXT-67D55E?logo=wxt&logoColor=fff)](https://wxt.dev)
- [![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=fff)](https://bun.sh/)
- [![Iconify](https://img.shields.io/badge/Iconify-026C9C?logo=iconify&logoColor=fff)](https://icon-sets.iconify.design/)

## Notice
NOT AFFILIATED WITH OR APPROVED BY IMGUR
