# Provenance

This is an independent TypeScript implementation of Victor Taelin's UNII memory
design, originally published as OptChat and subsequently named UniiChat.
This package is not an official UNII release.

Original implementation and documentation: copyright (c) 2026 Igor Loskutov,
released under the MIT license in LICENSE.

Tree selection and batching in src/tree.ts are adapted from pi-optchat by
Jonas Silva:
https://github.com/jonaslsaa/pi-optchat/tree/2bdbd4df63c696fabc06ee9bc616245083069097

The copied/adapted implementation code is MIT licensed:

MIT License

Copyright (c) 2026 Jonas Silva

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The design originates in Victor Taelin's UNII/OptChat specification:
https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449
Upstream specification and prompt text are not bundled or relicensed here.
Our tracked specification describes this library's contract in original wording.
No license grant for Victor Taelin's upstream text is asserted by this package.
These provenance notices do not add an exception to this package's MIT license.

Behavioral oracle: https://github.com/dearlordylord/unii-memory
Pinned as references/lisp, retaining its own MIT license and notices.

Implementation assistance: Codex:gpt-6-1-sol. The extraction methodology,
adaptation decisions and validation limits are recorded in docs/METHODOLOGY.md.
