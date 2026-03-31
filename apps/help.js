import plugin from "../../../lib/plugins/plugin.js"

export class classtableHelp extends plugin {
  constructor() {
    super({
      name: 'classtable:帮助',
      dsc: '课表插件帮助',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: '^(课表插件帮助|#clshelp)$',
          fnc: 'showMenu'
        }
      ]
    })
  }

  async showMenu(e) {
    const msg = `课表插件使用帮助\n` +
      `使用方法：\n` +
      `1. 打开wakeup课程表APP，点击右上角按钮\n` +
      `2. 复制分享口令，全部内容直接发送在群里\n` +
      `3. 导入成功后，Bot会自动撤回分享口令\n` +
      `查看群友目前在不在上课：\n` +
      `- 【所有群友在上什么课|#clstba】- 显示群内所有人的上课情况\n` +
      `- 【群友在上什么课|#clstb】- 只显示目前状态中前10的人\n` +
      `查询指定日期课表：\n` +
      `- 【今天课表/明天课表/后天课表/昨天课表】- 查询相对日期课表\n` +
      `- 【YYYY-MM-DD课表】- 查询指定日期课表（如：2025-04-01课表）\n` +
      `翘课：发送【什么水课，翘了！|#clsskip】、\n` +
      `取消翘课：发送【哎不翘了(还是)|#clsunskip】`
    await e.reply(msg)
  }
}
