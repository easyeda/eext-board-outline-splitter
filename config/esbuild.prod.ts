import process from 'node:process';
import esbuild from 'esbuild';

import common from './esbuild.common';

/**
 * 主进程 bundle：src/index → dist/index.js（IIFE，globalName 不可改）
 * iframe bundle：iframe/app → iframe/app.js（iframe 内 <script> 加载，驱动整条流水线）
 *
 * 两个 bundle 各自独立打包；共享的 src/core/* 会被分别打入各自产物（运行上下文隔离，正确性不受影响）。
 */
(async () => {
	// iframe 配置：复用 common 的平台/格式约束（platform/format/globalName/minify 等不可改项），
	// 仅覆盖入口与输出目录，使产物落在 iframe/ 下，匹配 /iframe/app.js 的路径约定。
	const iframeConfig: Parameters<(typeof esbuild)['build']>[0] = {
		...common,
		entryPoints: { app: './iframe/app' },
		outdir: './iframe/',
		entryNames: '[name]',
	};

	const mainCtx = await esbuild.context(common);
	const iframeCtx = await esbuild.context(iframeConfig);

	if (process.argv.includes('--watch')) {
		await Promise.all([mainCtx.watch(), iframeCtx.watch()]);
	}
	else {
		await Promise.all([mainCtx.rebuild(), iframeCtx.rebuild()]);
		process.exit();
	}
})();
