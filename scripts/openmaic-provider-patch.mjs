/** Patch the verified upstream source without maintaining a full provider catalog fork. */
export function patchOpenMAICProvider(source) {
  if (source.includes("import { applyStudyLoopThinking } from './studyloop-thinking';"))
    throw new Error('The OpenMAIC provider integration patch has already been applied.');
  const replacements = [
    [
      "import { normalizeAzureBaseUrl } from './azure';",
      "import { normalizeAzureBaseUrl } from './azure';\nimport { applyStudyLoopThinking } from './studyloop-thinking';",
    ],
    [
      '          const response = useStreamingChatCompat\n',
      "          init = applyStudyLoopThinking(\n            url, init, thinkingFromContext,\n            process.env.NEXT_PUBLIC_STUDYLOOP_EMBEDDED === 'true',\n          );\n          const response = useStreamingChatCompat\n",
    ],
  ];
  for (const [anchor, replacement] of replacements) {
    if (source.split(anchor).length !== 2)
      throw new Error('The OpenMAIC provider integration patch no longer matches its source.');
    source = source.replace(anchor, replacement);
  }
  return source;
}
