# Built-in OpenMAIC classroom / 内置 OpenMAIC 课堂

**Special thanks to [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), the THU-MAIC team, and all contributors.** StudyLoop now bundles their real classroom runtime, with a StudyLoop integration layer for shared model configuration, focused lesson handoff, and return navigation.

**特别感谢 OpenMAIC、THU-MAIC 团队及所有贡献者。** StudyLoop 已内置真实课堂运行时，并增加统一模型配置、根据答卷准备针对性课堂、返回原答卷等衔接。

## What is included / 包含什么

The pinned upstream source is OpenMAIC **1.0.0**, commit `dfebbcf33f3a56064129903faeab70a9e4243146`. It ships in [the source archive](../vendor/openmaic/source.tar.gz), checked against [the manifest](../vendor/openmaic/manifest.json), together with the separate [StudyLoop overlay](../integrations/openmaic/overlay). No existing personal classroom or private model configuration was copied into this distribution.

The embedded experience supports the classic classroom: slides, exercises, and standalone HTML learning interactions. A lesson is limited to **4–6 scenes**. Students confirm the outline before generating the classroom. Pro/PBL workbenches, upstream server persistence, arbitrary file uploads into OpenMAIC, cloud image/audio/video generation, and MP4 rendering are disabled in this integration. Browser/system read-aloud is available where supported.

固定上游版本为 **1.0.0**，提交 `dfebbcf33f3a56064129903faeab70a9e4243146`。项目保存公开源码归档、校验清单和独立的 StudyLoop 改动层，没有复制作者已有课堂或私有模型配置。内置流程使用经典课堂，包含幻灯片、练习与独立 HTML 互动；每课 **4–6 个场景**，先确认大纲再生成。Pro／PBL、上游共享服务端持久化、课堂内任意文件上传、云端图片／音视频生成及 MP4 渲染尚未开放。朗读使用浏览器／系统语音。

## Start and learn / 启动与学习

1. Follow the [project quick start](../README.md#quick-start). `npm run build` builds both StudyLoop and the classroom. Docker builds both into one image.
2. Save your model in **Models & settings / 模型与设置**. The classroom uses this same provider, address, model ID and server-side key; no second model setup or external OpenMAIC URL is required.
3. Complete a practice attempt. In the result, choose **Generate an interactive classroom / 生成互动课堂**. StudyLoop prepares the lesson request from that saved answer sheet and opens the built-in classroom on the same website.
4. Review the proposed outline and generate the lesson. Work through its scenes, explanations and interactions.
5. Use **Original attempt / 返回原答卷** to continue StudyLoop practice, or return to the classroom library. The original score is preserved; classroom completion does not automatically update mastery or rewrite the answer sheet.

中文步骤：安装并构建项目 → 在“模型与设置”保存模型 → 完成练习并打开结果 → 点击“生成互动课堂” → 确认大纲并生成 → 学完返回原答卷继续巩固。无需另开一个 OpenMAIC 服务或再填一套 API。下载 Markdown 学习简报仍可用于人工检查或导出，但已不是进入课堂的必要步骤。

The classroom process starts lazily on its first request and stops with StudyLoop. It listens only on an internal loopback port; the browser uses StudyLoop's authenticated proxy. A first visit can take longer while the runtime starts. A missing build is reported explicitly; run `npm run classroom:install` before starting the app again.

第一次进入课堂时按需启动内部进程，因此可能多等待片刻；关闭 StudyLoop 会一起关闭课堂进程。用户始终使用同一个网站，不需要打开内部端口。若提示未安装课堂，先停止应用，运行 `npm run classroom:install`，再启动。

## Configuration, cost, and data / 配置、费用与数据

Classroom model requests use the active StudyLoop configuration. A settings save applies to new requests and restarts the managed classroom when needed. Saved API keys are not returned to the browser. The obsolete `OPENMAIC_URL` setting is no longer used to route the built-in classroom.

The shared `DAILY_GENERATION_LIMIT` counts **generation requests, not courses**. A classroom normally uses an outline request and multiple scene requests; each scene commonly needs two generation requests. A six-scene classroom can therefore consume a substantial part of a default daily allowance of 20. Provider token charges are separate, and failed generation requests also consume the application allowance. Set limits appropriate to the deployment in the [configuration guide](configuration.md).

课堂复用当前 StudyLoop 模型配置；保存后用于新请求，必要时重启受管课堂进程。已有密钥不会回传网页，旧的 `OPENMAIC_URL` 不再决定课堂地址。每日额度按**生成请求**而非课程数量计算；大纲和各场景分别请求，每个场景通常需要两次，因此一门六场景课堂可能用掉默认 20 次额度中的较大部分。服务商按实际 Token 另行计费，失败请求也计入应用额度。

StudyLoop stores its materials, practice attempts, and owned handoff records in `DATA_DIR`. Classic classroom documents and progress are stored in the current browser's **IndexedDB**, separate from those server records. Clearing browser/site storage or switching browsers can lose access to those classrooms. Export classrooms from OpenMAIC to keep a backup. Rebuilding `.runtime` does not erase browser storage, and a server data-volume backup does not by itself back up browser classrooms.

StudyLoop 的资料、答卷及所属用户的课堂交接记录保存在 `DATA_DIR`。经典课堂文档和进度保存在当前浏览器的 **IndexedDB**，不在 StudyLoop 服务器数据卷中；清理站点数据或换浏览器可能丢失课堂，请使用课堂导出保存备份。重建 `.runtime` 不会删除浏览器课堂，但备份服务器数据卷也不能代替浏览器课堂备份。

The focused request includes relevant questions, selected answers, explanations and source metadata. The classroom sends its learning content to the configured model provider. Authored course text may contain personal information, so inspect exports before sharing. No automatic classroom completion or assessment callback is included.

## Rebuild or modify the classroom / 重建与修改课堂

Use **Node 22.13+ in the Node 22 release line** and Corepack with the upstream-pinned **pnpm 10.28.0**. The first build downloads dependencies and compiles the upstream workspace; allow several minutes and several gigabytes of working disk space. No model key is needed for a build.

```bash
npm run classroom:install
# Force rebuilding after an intentional change:
npm run classroom:install -- --force
```

Stop the running app before rebuilding. The build script verifies the source SHA-256, rejects unsafe archive entries, extracts into a clean temporary directory, applies `integrations/openmaic/overlay`, installs frozen dependencies, and builds the standalone server with a clean environment. It does not read the deployment's `.env` or an independent OpenMAIC installation. The prior runtime remains available if the new build fails. Successful builds are cached by source, overlay, build-tool and license-notice hashes.

The runtime is at `.runtime/openmaic/.next/standalone/server.js`. Static assets are copied beside it, while `.runtime/openmaic/public` remains available to the proxy's public-file checks. `.runtime` is generated and excluded from Git. Its `.studyloop-build.json` marker records the source/overlay hashes and build time.

重建前先停止应用。脚本校验源码 SHA-256、拒绝危险归档路径，在干净临时目录中应用改动并冻结安装依赖，以清洁环境构建；不读取部署 `.env` 或独立 OpenMAIC 项目。失败时保留原运行时，成功后按源码、改动层、构建工具与许可证说明的哈希复用缓存。`.runtime` 是可重建产物，不进入 Git。

To modify an upstream file, place its replacement at the matching relative path under `integrations/openmaic/overlay`. To replace the LGPL-covered formula converter, modify `integrations/openmaic/overlay/packages/mathml2omml/` and force a rebuild. The original library source and frozen lockfile remain in the archive; the overlay and build scripts provide the downstream application source needed to rebuild with that replacement. Preserve library licensing and notices. [Third-party notices and complete license texts](../THIRD_PARTY_NOTICES.md).

改动上游文件时，在 `integrations/openmaic/overlay` 下使用相同相对路径提供替换文件。修改 LGPL 公式转换库可使用 `overlay/packages/mathml2omml/` 后强制重建。源码、锁文件、改动层和构建脚本一同交付，用户可以替换该库并重新构建；需保留其许可证及署名。
