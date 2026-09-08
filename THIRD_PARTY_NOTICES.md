# Third-party notices and acknowledgments

## OpenMAIC

**Special thanks to [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), the THU-MAIC team, and all contributors for their work on open-source interactive AI education.**

**特别感谢 OpenMAIC、THU-MAIC 团队及所有贡献者，为开源 AI 互动教育提供的重要基础。**

StudyLoop bundles and adapts the real OpenMAIC classroom runtime. The upstream source is fixed at **`dfebbcf33f3a56064129903faeab70a9e4243146` (OpenMAIC 1.0.0)**. [The source manifest](vendor/openmaic/manifest.json) records its checksum and omitted upstream README media/repository automation; runtime source and workspace packages are retained in [the source archive](vendor/openmaic/source.tar.gz). StudyLoop changes are supplied separately in [the integration overlay](integrations/openmaic/overlay). No author's private API configuration or existing classroom is included.

Downstream changes connect the classroom to StudyLoop's model settings and session gate, prepare a focused lesson from an owned practice attempt, provide return navigation, and constrain the embedded experience to the classic browser-stored classroom. Pro/agent workbench, shared upstream server persistence, external media generation, and MP4 rendering are disabled. This integration does not imply endorsement by THU-MAIC.

OpenMAIC's original application code is **MIT, copyright (c) 2026 THU-MAIC**. Its [complete MIT notice](vendor/openmaic/licenses/OpenMAIC-MIT.txt) accompanies the source and built runtime. StudyLoop's original code remains MIT; the complete bundle also contains separately licensed components:

| Component                        | License and distribution notes                                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/mathml2omml`           | **LGPL-3.0-or-later**. Its complete source is inside the pinned archive; [LGPLv3](vendor/openmaic/licenses/mathml2omml-LGPL-3.0.txt) and [GPLv3](vendor/openmaic/licenses/GPL-3.0.txt) are included. The library and its use remain subject to these terms. |
| `packages/pptxgenjs`             | MIT; preserve its upstream copyright notices.                                                                                                                                                                                                               |
| OpenMAIC workspace packages      | Keep each package's included license.                                                                                                                                                                                                                       |
| Fonts and installed dependencies | Keep their own license and attribution files; font names and redistribution conditions are not replaced by the application MIT license. The pinned renderer contains a separate `font-licenses/ZcoolHappy-LICENSE.txt` notice.                              |

### Rebuilding or replacing the LGPL library

Recipients receive the OpenMAIC source, StudyLoop overlay, frozen dependency lockfile, and build scripts needed to rebuild the combined classroom with a modified `mathml2omml` library. Modifications to that library retain its LGPL terms. Do not restrict replacement of the library or reverse engineering needed to debug such changes. The bundled license texts describe the complete conditions.

Stop StudyLoop before rebuilding. To modify the library, add replacement source files under `integrations/openmaic/overlay/packages/mathml2omml/`, preserving the same relative paths as the upstream package. Then run `npm run classroom:install -- --force` with Node 22.13+ (Node 22 release line) and Corepack available. The script verifies the pinned archive, applies the overlay, rebuilds the library and classroom, and replaces the managed runtime only after a successful build. See [the rebuild guide](docs/openmaic.md#rebuild-or-modify-the-classroom--重建与修改课堂).

The Docker distribution includes the source archive, overlay, build scripts and license copies in addition to the runnable classroom. The top-level `LICENSE` covers StudyLoop's original work; it does not relicense the LGPL library or separately licensed assets.

中文说明：StudyLoop 已内置并改造固定版本的 OpenMAIC 真实课堂。公开包保留 THU-MAIC 的 MIT 版权与许可，同时包含 `mathml2omml` 的 LGPL／GPL 文本、完整源码及可替换重建步骤；不能把全部依赖统称为 MIT。发布包不包含作者私有配置或已有课堂。再次感谢上游团队及所有贡献者。

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

Model APIs, search services, and browser voices operate under their respective providers' terms. Compatibility with their interfaces is not affiliation, endorsement, or a guarantee of availability.
