import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import chokidar from "chokidar"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGIN_DIR = path.resolve(__dirname, "..")
const CONFIG_DIR = path.join(PLUGIN_DIR, "config")
const DEFAULT_CONFIG_PATH = path.join(CONFIG_DIR, "config_default.yaml")
const USER_CONFIG_PATH = path.join(CONFIG_DIR, "config.yaml")

const classtableConfig = {}
let watcherStarted = false

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function normalizeLineEndings(content) {
  return String(content).replace(/\r\n/g, "\n")
}

function splitConfigSections(content) {
  const lines = normalizeLineEndings(content).split("\n")
  const sections = []
  let pending = []
  let buffer = []
  let tail = []
  let currentKey = null

  const pushSection = () => {
    if (!currentKey || buffer.length === 0) return
    sections.push({
      key: currentKey,
      content: `${buffer.join("\n")}\n`
    })
  }

  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s|$)/)
    if (keyMatch) {
      pending = [...pending, ...tail]
      tail = []
      pushSection()
      currentKey = keyMatch[1]
      buffer = [...pending, line]
      pending = []
      continue
    }

    if (currentKey) {
      if (/^\s*(?:#.*)?$/.test(line)) {
        tail.push(line)
      } else {
        if (tail.length > 0) {
          buffer.push(...tail)
          tail = []
        }
        buffer.push(line)
      }
    } else {
      pending.push(line)
    }
  }

  if (tail.length > 0) {
    buffer.push(...tail)
  }
  pushSection()
  return sections
}

function appendMissingConfigSections(defaultContent, userContent) {
  const defaultConfig = YAML.parse(defaultContent) || {}
  const userConfig = YAML.parse(userContent) || {}
  const missingKeys = Object.keys(defaultConfig).filter((key) => !(key in userConfig))

  if (missingKeys.length === 0) {
    return { content: userContent, appended: false }
  }

  const sectionMap = new Map(splitConfigSections(defaultContent).map((section) => [section.key, section.content]))
  const normalizedUserContent = normalizeLineEndings(userContent)
  const chunks = [normalizedUserContent.replace(/\s*$/, "")]

  for (const key of missingKeys) {
    const sectionContent = sectionMap.get(key)
    if (!sectionContent) continue
    chunks.push(sectionContent.replace(/\s+$/, ""))
  }

  return {
    content: `${chunks.filter(Boolean).join("\n\n")}\n`,
    appended: true
  }
}

function syncUserConfigFile() {
  ensureConfigDir()

  const defaultContent = fs.readFileSync(DEFAULT_CONFIG_PATH, "utf8")
  if (!fs.existsSync(USER_CONFIG_PATH)) {
    fs.writeFileSync(USER_CONFIG_PATH, defaultContent, "utf8")
    return { defaultConfig: YAML.parse(defaultContent) || {}, userConfig: YAML.parse(defaultContent) || {} }
  }

  const userContent = fs.readFileSync(USER_CONFIG_PATH, "utf8")
  const { content, appended } = appendMissingConfigSections(defaultContent, userContent)
  if (appended) {
    fs.writeFileSync(USER_CONFIG_PATH, content, "utf8")
  }

  return {
    defaultConfig: YAML.parse(defaultContent) || {},
    userConfig: YAML.parse(content) || {}
  }
}

function refreshClasstableConfig() {
  const { defaultConfig, userConfig } = syncUserConfigFile()
  const nextConfig = { ...defaultConfig, ...userConfig }

  for (const key of Object.keys(classtableConfig)) {
    if (!(key in nextConfig)) {
      delete classtableConfig[key]
    }
  }
  Object.assign(classtableConfig, nextConfig)
  return classtableConfig
}

function startWatcher() {
  if (watcherStarted) return
  watcherStarted = true

  chokidar
    .watch([DEFAULT_CONFIG_PATH, USER_CONFIG_PATH], { ignoreInitial: true, persistent: false })
    .on("add", () => {
      try {
        refreshClasstableConfig()
      } catch (err) {
        logger.error(`[ClassTable] 配置文件新增后刷新失败: ${err}`)
      }
    })
    .on("change", () => {
      try {
        refreshClasstableConfig()
      } catch (err) {
        logger.error(`[ClassTable] 配置热更新失败: ${err}`)
      }
    })
}

export function initClasstableConfig() {
  refreshClasstableConfig()
  startWatcher()
  return classtableConfig
}

export function getClasstableConfig() {
  if (!watcherStarted) {
    initClasstableConfig()
  }
  return classtableConfig
}

initClasstableConfig()

export default classtableConfig
