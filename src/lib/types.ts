export interface CliOptions {
  project: string;
}

export interface NgPackageOptions {
  name: string;
  namespace: string;
  src: string;
  outDir: string;
  temp: string;
  packagesTemp: string;
  bundlesTemp: string;
  entry: string;
}
