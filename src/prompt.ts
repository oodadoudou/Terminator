import { execaCommand } from 'execa';
import {
  getExplanation,
  getRevision,
  getScriptAndInfo,
} from './helpers/completion';
import { getConfig } from './helpers/config';
import { projectName } from './helpers/constants';
import { KnownError } from './helpers/error';
import clipboardy from 'clipboardy';
import i18n from './helpers/i18n';
import { appendToShellHistory } from './helpers/shell-history';
import * as p from './helpers/plain-prompts';

const HOT_PINK = '\x1b[38;2;255;46;126m';
const RESET_COLOR = '\x1b[0m';

const init = async () => {
  try {
    const { LANGUAGE: language } = await getConfig();
    i18n.setLanguage(language);
  } catch {
    i18n.setLanguage('en');
  }
};

const examples: string[] = [];
const initPromise = init();
initPromise.then(() => {
  examples.push(i18n.t('delete all log files'));
  examples.push(i18n.t('list js files'));
  examples.push(i18n.t('fetch me a random joke'));
  examples.push(i18n.t('list all commits'));
});

const sample = <T>(arr: T[]): T | undefined => {
  const len = arr == null ? 0 : arr.length;
  return len ? arr[Math.floor(Math.random() * len)] : undefined;
};

async function runScript(script: string) {
  console.log(`${i18n.t('Running')}: ${script}`);
  console.log('');
  try {
    await execaCommand(script, {
      stdio: 'inherit',
      shell: process.env.SHELL || true,
    });
    appendToShellHistory(script);
  } catch (error) {
    // Nothing needed, it'll output to stderr
  }
}

async function getPrompt(prompt?: string) {
  await initPromise;
  const promptValue = await p.text({
    message: i18n.t('What would you like me to do?'),
    placeholder: `${i18n.t('e.g.')} ${sample(examples)}`,
    initialValue: prompt,
    defaultValue: i18n.t('Say hello'),
    validate: (value) => {
      if (!value) return i18n.t('Please enter a prompt.');
    },
  });
  if (p.isCancel(promptValue)) {
    p.cancel(i18n.t('Goodbye!'));
    process.exit(0);
  }
  return promptValue as string;
}

async function promptForRevision() {
  const promptValue = await p.text({
    message: i18n.t('What would you like me to change in this script?'),
    placeholder: i18n.t('e.g. change the folder name'),
    validate: (value) => {
      if (!value) return i18n.t('Please enter a prompt.');
    },
  });
  if (p.isCancel(promptValue)) {
    p.cancel(i18n.t('Goodbye!'));
    process.exit(0);
  }
  return promptValue as string;
}

export async function prompt({
  usePrompt,
  silentMode,
}: { usePrompt?: string; silentMode?: boolean } = {}) {
  const {
    OPENAI_KEY: key,
    SILENT_MODE,
    OPENAI_API_ENDPOINT: apiEndpoint,
    MODEL: model,
  } = await getConfig();
  const skipCommandExplanation = silentMode || SILENT_MODE;

  console.log('');
  const thePrompt = usePrompt || (await getPrompt());
  const spin = p.spinner();
  spin.start(i18n.t(`Loading...`));
  const { readInfo, readScript } = await getScriptAndInfo({
    prompt: thePrompt,
    key,
    model,
    apiEndpoint,
  });
  spin.stop('');
  console.log(`${projectName} ▶ Generated command`);
  console.log('');
  const script = await readScript(
    createLinePrefixWriter(
      `${HOT_PINK}>${RESET_COLOR} `,
      process.stdout.write.bind(process.stdout)
    )
  );
  console.log('');
  if (!skipCommandExplanation) {
    spin.start(i18n.t(`Getting explanation...`));
    let explanationText = await readInfo(() => {});
    if (!explanationText) {
      const { readExplanation } = await getExplanation({
        script,
        key,
        model,
        apiEndpoint,
      });
      explanationText = await readExplanation(() => {});
    }
    spin.stop('');
    console.log('');
    renderExplanation(explanationText);
    console.log('');
  }

  await runOrReviseFlow(script, key, model, apiEndpoint, silentMode);
}

async function runOrReviseFlow(
  script: string,
  key: string,
  model: string,
  apiEndpoint: string,
  silentMode?: boolean
) {
  const emptyScript = script.trim() === '';

  const answer: symbol | (() => any) = await p.select({
    message: `${HOT_PINK}▶ What next?${RESET_COLOR}`,
    format: {
      activePrefix: '  → ',
      inactivePrefix: '      ',
      labelWidth: 10,
    },
    options: [
      ...(emptyScript
        ? []
        : [
            {
              label: 'Run',
              hint: 'execute the command',
              value: async () => {
                await runScript(script);
              },
            },
          ]),
      {
        label: 'Revise',
        hint: 'ask AI to improve it',
        value: async () => {
          await revisionFlow(script, key, model, apiEndpoint, silentMode);
        },
      },
      ...(emptyScript
        ? []
        : [
            {
              label: 'Edit',
              hint: 'edit manually',
              value: async () => {
                const newScript = await p.text({
                  message: i18n.t('you can edit script here:'),
                  initialValue: script,
                });
                if (!p.isCancel(newScript)) {
                  await runScript(newScript as string);
                }
              },
            },
          ]),
      {
        label: 'Copy',
        hint: 'copy to clipboard',
        value: async () => {
          await clipboardy.write(script);
          console.log(i18n.t('Copied to clipboard!'));
        },
      },
      {
        label: 'Cancel',
        hint: 'abort',
        value: () => {
          p.cancel(i18n.t('Goodbye!'));
          process.exit(0);
        },
      },
    ],
  });

  if (typeof answer === 'function') {
    await answer();
  }
}

async function revisionFlow(
  currentScript: string,
  key: string,
  model: string,
  apiEndpoint: string,
  silentMode?: boolean
) {
  const revision = await promptForRevision();
  const spin = p.spinner();
  spin.start(i18n.t(`Loading...`));
  const { readScript } = await getRevision({
    prompt: revision,
    code: currentScript,
    key,
    model,
    apiEndpoint,
  });
  spin.stop('');

  console.log(`${projectName} ▶ Generated command`);
  console.log('');
  const script = await readScript(
    createLinePrefixWriter(
      `${HOT_PINK}>${RESET_COLOR} `,
      process.stdout.write.bind(process.stdout)
    )
  );
  console.log('');

  if (!silentMode) {
    const infoSpin = p.spinner();
    infoSpin.start(i18n.t(`Getting explanation...`));
    const { readExplanation } = await getExplanation({
      script,
      key,
      model,
      apiEndpoint,
    });

    const explanationText = await readExplanation(() => {});
    infoSpin.stop('');
    console.log('');
    renderExplanation(explanationText);
    console.log('');
  }

  await runOrReviseFlow(script, key, model, apiEndpoint, silentMode);
}

export const parseAssert = (name: string, condition: any, message: string) => {
  if (!condition) {
    throw new KnownError(
      `${i18n.t('Invalid config property')} ${name}: ${message}`
    );
  }
};

const createLinePrefixWriter = (
  prefix: string,
  write: (chunk: string) => void
) => {
  let atLineStart = true;
  return (chunk: string) => {
    const text = String(chunk);
    let output = '';
    for (let i = 0; i < text.length; i += 1) {
      if (atLineStart) {
        output += prefix;
        atLineStart = false;
      }
      const char = text[i];
      output += char;
      if (char === '\n') {
        atLineStart = true;
      }
    }
    write(output);
  };
};

const renderExplanation = (text: string) => {
  const lines = formatExplanation(text);
  console.log(`${HOT_PINK}Explanation:${RESET_COLOR}`);
  for (const line of lines) {
    console.log(line);
  }
};

const formatExplanation = (text: string) => {
  const cleaned = (text ?? '').replace(/\r\n/g, '\n').trim();
  const normalized = cleaned.replace(/\*\*(Description|Steps)\*\*/gi, '$1');
  const lines = normalized.split('\n');
  const descriptionParts: string[] = [];
  const stepsParts: string[] = [];
  let section: 'description' | 'steps' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const descMatch = trimmed.match(/^Description:\s*(.*)$/i);
    if (descMatch) {
      section = 'description';
      if (descMatch[1]) descriptionParts.push(descMatch[1].trim());
      continue;
    }
    const stepsMatch = trimmed.match(/^Steps:\s*(.*)$/i);
    if (stepsMatch) {
      section = 'steps';
      if (stepsMatch[1]) stepsParts.push(stepsMatch[1].trim());
      continue;
    }
    if (section === 'steps') {
      stepsParts.push(trimmed);
    } else {
      descriptionParts.push(trimmed);
    }
  }

  const description = descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
  const stepItems: string[] = [];

  for (const line of stepsParts) {
    const match = line.match(/^(?:[-*]|\d+[).])\s*(.+)$/);
    if (match) {
      stepItems.push(match[1].trim());
    }
  }

  const output: string[] = [];
  output.push(`- Description: ${description}`);

  if (stepItems.length === 0) {
    output.push('- Steps: (none)');
    return output;
  }

  output.push('- Steps:');
  stepItems.forEach((step, index) => {
    output.push(`  ${index + 1}) ${step}`);
  });

  return output;
};
