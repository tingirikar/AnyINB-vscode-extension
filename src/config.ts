import { LANGUAGE_CONFIGS } from './executors/processExecutor';

export const NOTEBOOK_TYPE = 'anyinb';
export const NOTEBOOK_CONTROLLER_ID = 'anyinb-controller';
export const NOTEBOOK_LABEL = 'AnyINB';

export const DATABASE_LANGUAGES = ['sql', 'javascript', 'postgres', 'sqlite', 'redis', 'mongodb', 'mongosh'];
export const PROCESS_LANGUAGES = Object.keys(LANGUAGE_CONFIGS);
export const SHELL_LANGUAGES = ['shellscript', 'powershell', 'bat', 'cmd', 'wsl', 'bash'];
export const HTTP_LANGUAGES = ['http'];

export const ALL_SUPPORTED_LANGUAGES = [
    ...new Set([
        ...DATABASE_LANGUAGES,
        ...PROCESS_LANGUAGES,
        ...SHELL_LANGUAGES,
        ...HTTP_LANGUAGES,
        'markdown',
    ]),
];

export const DEFAULT_ANYINB_SETTINGS = {
    useSandboxIfDisconnected: true,
    outputTheme: 'mongosh-terminal',
    maxOutputHeight: 450,
    fontSize: 13,
    pythonAutoPlot: true,
    useDocker: false,
    runAllMode: 'sequential',
} as const;

export const NOTEBOOK_COMMANDS = {
    configureConnection: `${NOTEBOOK_TYPE}.configureConnection`,
    quickConnect: `${NOTEBOOK_TYPE}.quickConnect`,
    disconnectAll: `${NOTEBOOK_TYPE}.disconnectAll`,
    selectTheme: `${NOTEBOOK_TYPE}.selectTheme`,
    newNotebook: `${NOTEBOOK_TYPE}.newNotebook`,
    enableSandbox: `${NOTEBOOK_TYPE}.enableSandbox`,
    startPresentation: `${NOTEBOOK_TYPE}.startPresentation`,
} as const;
