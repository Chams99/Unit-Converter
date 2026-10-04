# Third-party notices

Universal Convertal contains a small set of generated UI primitives and uses
the following open-source dependencies. Dependency versions are pinned through
`pnpm-lock.yaml`; this file records the source and attribution boundary for the
first release.

## Generated or adapted UI code

- `apps/web/src/components/ui/` contains shadcn/ui-style components generated
  from the [shadcn/ui](https://ui.shadcn.com/) registry and adapted for this
  application. The registry code is MIT licensed; see the
  [shadcn/ui license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).
- Those primitives wrap [Radix UI](https://www.radix-ui.com/) packages. Radix
  primitives are MIT licensed; see the
  [Radix license](https://github.com/radix-ui/primitives/blob/main/LICENSE).
- Generated shadcn primitives may import icons from
  [Lucide](https://lucide.dev/), which is ISC licensed; see the
  [Lucide license](https://github.com/lucide-icons/lucide/blob/main/LICENSE).
- The product workbench uses local paths in
  `apps/web/src/components/convertal/FlatIcon.tsx`, copied from the official
  [Bootstrap Icons](https://icons.getbootstrap.com/) SVG source. Bootstrap
  Icons are MIT licensed; see the
  [Bootstrap Icons license](https://github.com/twbs/icons/blob/main/LICENSE).

The Bootstrap Icons paths included in `FlatIcon.tsx` are covered by this
upstream notice:

```text
The MIT License (MIT)

Copyright (c) 2019-2024 The Bootstrap Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

The product-specific composition and styling are custom work in
`apps/web/app/`, `apps/web/src/components/convertal/`, and
`apps/web/app/globals.css`. The repository does not copy a complete SaaS
starter or template application.

## Runtime and build dependencies

The main runtime/build libraries retain their upstream licenses and notices:

- [Next.js](https://github.com/vercel/next.js/blob/canary/license.md) and
  [React](https://github.com/facebook/react/blob/main/LICENSE) — MIT.
- [Fastify](https://github.com/fastify/fastify/blob/main/LICENSE) and the
  `@fastify/*` plugins — MIT.
- [Sharp](https://github.com/lovell/sharp/blob/main/LICENSE) — Apache-2.0.
- [Decimal.js](https://github.com/MikeMcl/decimal.js/blob/master/LICENSE) — MIT.
- [TypeBox](https://github.com/sinclairzx81/typebox/blob/main/license) — MIT.

Transitive packages are managed by pnpm and retain their own package metadata;
run `pnpm licenses list` (or inspect the package's published metadata) when a
distribution requires a complete transitive notice bundle.
