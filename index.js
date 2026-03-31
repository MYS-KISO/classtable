import fs from 'node:fs'

logger.mark(`[ClassTable] 正在加载课表插件...`)

let ret = []

const files = fs
  .readdirSync('./plugins/classtable/apps')
  .filter((file) => file.endsWith('.js'))

files.forEach((file) => {
    ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  let name = files[i].replace('.js', '')
  
  if (ret[i].status != 'fulfilled') {
    logger.error(`[ClassTable] 载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

logger.mark(`[ClassTable] 课表插件加载完成`)

export { apps }
