import path from "node:path"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"

/**
 * 渲染图片
 * @param pluginName 插件名称
 * @param tplName 模板名称
 * @param data 渲染数据
 * @param e Event
 */
export async function renderImg(pluginName, tplName, data, e) {
  try {
    const pluginResources = `./plugins/${pluginName}/resources`
    const tplFile = `${pluginResources}/html/${tplName}.html`
    const _res_path = path.join(process.cwd(), 'plugins', pluginName, 'resources')

    const base64 = await puppeteer.screenshot(pluginName, {
      saveId: tplName,
      imgType: 'png',
      tplFile,
      pluginResources,
      _res_path,
      ...data
    })

    if (base64) {
      await e.reply(base64)
      return true
    }
    return false
  } catch (error) {
    logger.error(`[ClassTable] 渲染图片失败: ${error}`)
    return false
  }
}
