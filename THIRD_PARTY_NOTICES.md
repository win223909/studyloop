# Third-party notices and acknowledgments

## OpenMAIC

**Special thanks to [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), the THU-MAIC team, and all contributors for their work on open-source interactive AI education.**

**特别感谢 OpenMAIC、THU-MAIC 团队及所有贡献者，为开源 AI 互动教育提供的重要基础。**

StudyLoop `v0.1.0-alpha.1` provides an original Markdown learning-brief bridge compatible with OpenMAIC's material input. OpenMAIC is installed and operated separately. This release does not redistribute its source, runtime, classroom assets, or a modified fork, and does not imply endorsement by the upstream team. Planned improvements are described in [the roadmap](docs/roadmap.md).

Upstream license: [MIT, copyright (c) 2026 THU-MAIC](https://github.com/THU-MAIC/OpenMAIC/blob/main/LICENSE). If a future release incorporates OpenMAIC code, it must retain the selected version's copyright and permission notice, identify the pinned version, and document downstream modifications. Any separately licensed assets or dependencies must be reviewed on their own terms.

## Application dependencies

Dependencies are installed through npm; exact resolved versions are recorded in `package-lock.json`. Their license files remain part of their installed packages. Major direct libraries include:

| Project                                                     | Role                           | Upstream license                                 |
| ----------------------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| [React](https://github.com/facebook/react)                  | User interface                 | MIT                                              |
| [Vite](https://github.com/vitejs/vite)                      | Frontend build and development | MIT                                              |
| [Express](https://github.com/expressjs/express)             | HTTP server                    | MIT                                              |
| [Helmet](https://github.com/helmetjs/helmet)                | HTTP security headers          | MIT                                              |
| [cookie-parser](https://github.com/expressjs/cookie-parser) | Cookie parsing                 | MIT                                              |
| [Multer](https://github.com/expressjs/multer)               | File upload handling           | MIT                                              |
| [PDF.js](https://github.com/mozilla/pdf.js)                 | PDF text extraction            | Apache-2.0                                       |
| [Lucide](https://github.com/lucide-icons/lucide)            | Interface icons                | ISC; some icons derive from MIT-licensed Feather |
| [Zod](https://github.com/colinhacks/zod)                    | Validation dependency          | MIT                                              |
| [Playwright](https://github.com/microsoft/playwright)       | Browser testing                | Apache-2.0                                       |

This overview does not replace each package's license or a complete dependency inventory. Review transitive dependencies and their bundled notices when redistributing builds.

## Course content, search, and provider services

The bundled course examples are original StudyLoop educational material released under **[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)**, as declared in their source metadata. They contain no imported school documents or real student work. The application code remains MIT-licensed.

Wikipedia material and other search results are externally authored. Source URLs, source type, and available license information are preserved in course packs; the MIT license for StudyLoop does not relicense that material. Brave search excerpts are labeled as excerpts and do not imply permission to republish the full underlying page. Users are responsible for sharing course materials only where their rights permit.

Model APIs, search services, browser voices, and independently installed OpenMAIC instances operate under their respective providers' terms. Compatibility with their interfaces is not affiliation, endorsement, or a guarantee of availability.
