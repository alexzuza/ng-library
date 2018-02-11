import chalk from 'chalk';


export const log = {
  info: (message: any) => console.log(chalk.blue(message)),
  error: (message: any) => console.log(chalk.red(message))
};
