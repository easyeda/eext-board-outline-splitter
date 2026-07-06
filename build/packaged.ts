import path from 'node:path';
import fs from 'fs-extra';
import ignore from 'ignore';
import JSZip from 'jszip';

import * as extensionConfig from '../extension.json';

/**
 * 将多行字符串拆分成字符串数组
 *
 * @param str - 多行字符串
 * @returns 字符串数组
 */
function multiLineStrToArray(str: string): Array<string> {
	return str.split(/[\r\n]+/);
}

/**
 * 检查 UUID 是否合法
 *
 * @param uuid - UUID
 * @returns 是否合法
 */
function testUuid(uuid?: string): uuid is string {
	const regExp = /^[a-z0-9]{32}$/;
	if (uuid && uuid !== '00000000000000000000000000000000') {
		return regExp.test(uuid.trim());
	}
	else {
		return false;
	}
}

/**
 * 获取正确的 UUID
 *
 * @param uuid - UUID
 * @returns UUID
 */
function fixUuid(uuid?: string): string {
	uuid = uuid?.trim() || undefined;
	if (testUuid(uuid)) {
		return uuid.trim();
	}
	else {
		return crypto.randomUUID().replaceAll('-', '');
	}
}

/**
 * 主逻辑方法
 */
async function main() {
	if (!testUuid(extensionConfig.uuid)) {
		const newExtensionConfig = { ...extensionConfig };
		// @ts-expect-error - Removing default property from extension config
		delete newExtensionConfig.default;
		newExtensionConfig.uuid = fixUuid(extensionConfig.uuid);
		fs.writeJsonSync(path.join(__dirname, '../extension.json'), newExtensionConfig, { spaces: '\t', EOL: '\n', encoding: 'utf-8' });
	}
	const filepathListWithoutFilter = fs.readdirSync(path.join(__dirname, '../'), { encoding: 'utf-8', recursive: true });
	const edaignoreListWithoutResolve = multiLineStrToArray(fs.readFileSync(path.join(__dirname, '../.edaignore'), { encoding: 'utf-8' }));
	const edaignoreList: Array<string> = [];
	for (const edaignoreLine of edaignoreListWithoutResolve) {
		if (edaignoreLine.endsWith('/') || edaignoreLine.endsWith('\\')) {
			edaignoreList.push(edaignoreLine.slice(0, edaignoreLine.length - 1));
		}
		else {
			edaignoreList.push(edaignoreLine);
		}
	}
	const edaignore = ignore().add(edaignoreList);
	const filepathListWithoutResolve = edaignore.filter(filepathListWithoutFilter);
	const fileList: Array<string> = [];
	const folderList: Array<string> = []; // 无用数据
	for (const filepath of filepathListWithoutResolve) {
		if (fs.lstatSync(filepath).isFile()) {
			fileList.push(filepath.replace(/\\/g, '/'));
		}
		else {
			folderList.push(filepath.replace(/\\/g, '/'));
		}
	}

	const zip = new JSZip();
	for (const file of fileList) {
		zip.file(file, fs.readFileSync(path.join(__dirname, '../', file)));
	}

	// 用 generateAsync + writeFileSync（而非 generateNodeStream().pipe()）：后者不 await，
	// 进程可能在写完前退出，导致 .eext 残留旧内容（曾因此图片/最新 README 未打进包）。
	const outPath = path.join(__dirname, 'dist', `${extensionConfig.name}_v${extensionConfig.version}.eext`);
	fs.ensureDirSync(path.dirname(outPath));
	const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
	fs.writeFileSync(outPath, buf);
	console.log(`packaged ${fileList.length} files -> ${outPath}`);
}

main().catch((e) => {
	console.error('packaged failed:', e);
	process.exit(1);
});
