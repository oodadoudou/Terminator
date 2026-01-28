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
    renderExplanation(explanationText, script);
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
    renderExplanation(explanationText, script);
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

const renderExplanation = (text: string, script: string) => {
  const lines = formatExplanation(text, script);
  console.log(`${HOT_PINK}Explanation:${RESET_COLOR}`);
  for (const line of lines) {
    console.log(line);
  }
};

const formatExplanation = (text: string, script: string) => {
  const cleaned = sanitizeExplanation(text ?? '').replace(/\r\n/g, '\n').trim();
  const lines = cleaned.split('\n');
  const otherLines: string[] = [];
  const commandParts: string[] = [];
  const descriptionParts: string[] = [];
  const stepsParts: string[] = [];
  const outputParts: string[] = [];
  let section: 'command' | 'description' | 'steps' | 'output' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commandMatch = trimmed.match(/^Command:\s*(.*)$/i);
    if (commandMatch) {
      section = 'command';
      if (commandMatch[1]) commandParts.push(commandMatch[1].trim());
      continue;
    }
    const scriptMatch = trimmed.match(/^Script:\s*(.*)$/i);
    if (scriptMatch) {
      section = 'command';
      if (scriptMatch[1]) commandParts.push(scriptMatch[1].trim());
      continue;
    }
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
    const outputMatch = trimmed.match(/^Output:\s*(.*)$/i);
    if (outputMatch) {
      section = 'output';
      if (outputMatch[1]) outputParts.push(outputMatch[1].trim());
      continue;
    }
    if (section === 'command') {
      commandParts.push(trimmed);
    } else if (section === 'description') {
      descriptionParts.push(trimmed);
    } else if (section === 'steps') {
      stepsParts.push(trimmed);
    } else if (section === 'output') {
      outputParts.push(trimmed);
    } else {
      otherLines.push(trimmed);
    }
  }

  const fallbackDescription = otherLines.join(' ').replace(/\s+/g, ' ').trim();
  const description = descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
  const outputLine = outputParts.join(' ').replace(/\s+/g, ' ').trim();
  const commandLine = commandParts.join(' ').replace(/\s+/g, ' ').trim();
  const scriptCommand =
    script
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';

  const stepItems: string[] = [];
  for (const line of stepsParts) {
    const match = line.match(/^(?:[-*]|\d+[).])\s*(.+)$/);
    if (match) {
      stepItems.push(match[1].trim());
    } else {
      stepItems.push(line.trim());
    }
  }

  const resolvedCommand = commandLine || scriptCommand || '(unknown)';
  const resolvedDescription = description || fallbackDescription || '(unknown)';
  const resolvedOutput = outputLine || '(unknown)';

  const output: string[] = [];
  output.push(`- Command: ${resolvedCommand}`);
  output.push(`- Description: ${resolvedDescription}`);
  if (stepItems.length === 0) {
    output.push('- Steps: (none)');
  } else {
    output.push('- Steps:');
    stepItems.forEach((step, index) => {
      output.push(`  ${index + 1}) ${step}`);
    });
  }
  output.push(`- Output: ${resolvedOutput}`);

  return output;
};

const sanitizeExplanation = (text: string) =>
  text
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\r\n/g, '\n');
