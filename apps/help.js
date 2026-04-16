import plugin from "../../../lib/plugins/plugin.js"
import common from "../../../lib/common/common.js"

export class classtableHelp extends plugin {
  constructor() {
    super({
      name: 'classtable:帮助',
      dsc: '课表插件帮助',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: '^课表插件帮助$',
          fnc: 'showMenu'
        }
      ]
    })
  }

  async showMenu(e) {
    const botName = Bot[e.self_id || Bot.uin]?.nickname || Bot.nickname || 'Bot'
    const msg = [`课表插件使用帮助`]

    msg.push([`使用方法：`,
      `1. 打开 Wakeup 课程表APP，点击右上角按钮`,
      `2. 点击 “在线分享课表” 复制分享口令，然后 @${botName} 发送`,
      `3. 导入成功后，Bot会自动撤回分享口令`,
    ].join('\n'))

    msg.push([`查看群友目前在不在上课：`,
      `- 【所有群友在上什么课】- 显示群内所有人的上课情况`,
      `- 【群友在上什么课】- 只显示目前状态中前10的人`,
    ].join('\n'))

    msg.push([`查询指定日期课表：`,
      `- 【今天课表/明天课表/后天课表/昨天课表】- 查询相对日期课表`,
      `- 【YYYY-MM-DD课表】- 查询指定日期课表（如：2025-04-01课表）`,
    ].join('\n'))

    msg.push([`翘课：`,
      `发送【什么??课，翘了！】问号内容可以自行发挥`,
      `或者使用【#clsskip】`,
      `取消翘课：`,
      `发送【哎不翘了还是】或【#clscancel】`,
    ].join('\n'))

    const forwardMsg = await common.makeForwardMsg(e, msg, "课表插件使用帮助")
    await e.reply(forwardMsg)
  }
}
