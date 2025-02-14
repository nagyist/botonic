import * as spawn from 'await-spawn'
import { prompt } from 'inquirer'
import { green, red } from 'colors'
import { readdirSync } from 'fs'
import { writeFileSync } from 'fs'
import { readFileSync } from 'fs'
import { join } from 'path'

export enum Versions {
  ALPHA = 'alpha',
  BETA = 'beta',
  RC = 'rc',
  FINAL = 'final',
}

const nonFinalVersions = Object.values(Versions).filter(
  v => v !== Versions.FINAL
)

export const CONSTANTS = {
  PACKAGES_DIRNAME: 'packages',
  BOTONIC_PACKAGES_REF: 'botonic-',
}

/**
 * It orders the list so the packages depended by others get published first
 * e.g.: ['botonic-core', ..., 'botonic-cli']
 * @param packagesDir
 */
export const sortPackagesByPreference = (packagesDir: string): string[] => {
  const packagesList = readdirSync(packagesDir).filter(p =>
    p.includes(CONSTANTS.BOTONIC_PACKAGES_REF)
  )
  packagesList.push(String(packagesList.shift()))
  return packagesList
}

export const fromEntries = (xs: [string | number | symbol, any][]) =>
  xs.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})

export const readJSON = (jsonPath: string): any =>
  JSON.parse(readFileSync(jsonPath, { encoding: 'utf-8' as BufferEncoding }))

export const writeJSON = (jsonPath: string, object: any): void =>
  writeFileSync(jsonPath, JSON.stringify(object, null, 2) + '\n')

export const spawnProcess = async (
  command: string,
  args: string[] = [],
  log?: { onSuccess: () => void }
): Promise<void> => {
  try {
    await spawn(command, args)
    log?.onSuccess()
  } catch (e) {
    console.log(
      red(
        `   Failed on running command ${command} ${args.join(
          ' '
        )}:\n${e.stderr.toString()}`
      )
    )
    process.exit(1)
  }
}

export const clean = async (): Promise<void> => {
  console.log(' - Cleaning...')
  await spawnProcess('rm', ['-rf', 'node_modules', 'dist', 'lib'], {
    onSuccess: () => console.log(green('   Project cleaned.\n')),
  })
}

export const getPackageJSON = packagePath =>
  readJSON(join(packagePath, 'package.json'))

export const getPkgVersion = packagePath =>
  readJSON(join(packagePath, 'package.json')).version

export const bumpVersion = async (version, packagePath) => {
  console.log(' - Bumping version...')
  const logBumpedVersion = () => {
    console.log(green(`   Version bumped to ${getPkgVersion(packagePath)}.\n`))
  }
  if (version === Versions.FINAL) {
    await spawnProcess('npm', ['version', 'minor'], {
      onSuccess: logBumpedVersion,
    })
  } else if (nonFinalVersions.includes(version)) {
    await spawnProcess('npm', ['version', 'prerelease', `--preid=${version}`], {
      onSuccess: logBumpedVersion,
    })
  } else {
    await spawnProcess('npm', ['version', version], {
      onSuccess: logBumpedVersion,
    })
  }
  return getPkgVersion(packagePath)
}

export const changeBotonicDeps = async (packagePath, withVersion) => {
  console.log(' - Replacing botonic dependencies...')
  try {
    const packageJSON = getPackageJSON(packagePath)
    const newDependencies = fromEntries(
      Object.entries(packageJSON.dependencies).map(([k, v]) =>
        k.includes('@botonic') ? [k, withVersion] : [k, v]
      )
    )
    packageJSON.dependencies = newDependencies
    writeJSON(join(packagePath, 'package.json'), packageJSON)
    console.log(green('   Replaced botonic deps successfully.\n'))
  } catch (e) {
    console.log(red('   Failed at replacing botonic deps.'))
  }
}

export const installDeps = async (project: string) => {
  console.log(` - Installing ${project} dependencies...`)
  await spawnProcess('npm', ['install', '-D'], {
    onSuccess: () => console.log(green('   Installed successfully.\n')),
  })
}

export const build = async () => {
  console.log(` - Building...`)
  await spawnProcess('npm', ['run', 'build'], {
    onSuccess: () => console.log(green('   Built successfully.\n')),
  })
}

export const publish = async version => {
  console.log(` - Publishing ${version} version...`)

  if (nonFinalVersions.includes(version)) {
    await spawnProcess(
      'npm',
      ['publish', '--access=public', '--tag', version],
      {
        onSuccess: () => console.log(green('   Published successfully.\n')),
      }
    )
  } else if (version === Versions.FINAL) {
    await spawnProcess('npm', ['publish', '--access=public'], {
      onSuccess: () => console.log(green('   Published successfully.\n')),
    })
  } else return
}

export const doAskVersionToPublish = async (): Promise<string> => {
  const { version } = await prompt([
    {
      type: 'list',
      name: 'version',
      message: 'What version do you want to publish?',
      choices: [Versions.ALPHA, Versions.BETA, Versions.RC, Versions.FINAL],
    },
  ])
  return version
}

export const doAskForConfirmation = async (
  version: string
): Promise<boolean> => {
  let confirmation = undefined
  const confirmationMessage = `You are going to release a new ${version} version. Proceed?`
  const res = await prompt([
    {
      type: 'confirm',
      name: 'confirmation',
      message:
        version === Versions.FINAL
          ? red(confirmationMessage)
          : confirmationMessage,
    },
  ])
  confirmation = res.confirmation
  return Boolean(confirmation)
}

export const getVersionAndConfirmation = async () => {
  if (process.argv[2]) return { version: process.argv[2], confirmation: true }
  else {
    const version = await doAskVersionToPublish()
    const confirmation = await doAskForConfirmation(version)
    return { version, confirmation }
  }
}
