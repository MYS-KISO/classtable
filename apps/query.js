import fs from "node:fs"
import path from "node:path"
import plugin from "../../../lib/plugins/plugin.js"

const USER_DATA_DIR = path.join("./plugins", "classtable", "data", "users")

export class classtableQuery extends plugin {
  constructor() {
    super({
      name: 'classtable:查询课表',
      dsc: '查询指定日期课表',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: '^(今天|明天|后天|昨天)课表$',
          fnc: 'queryRelativeSchedule'
        },
        {
          reg: '^\\d{4}-\\d{2}-\\d{2}\\s*课表$',
          fnc: 'queryDateSchedule'
        },
        {
          reg: '^查课表\\s+\\d{4}-\\d{2}-\\d{2}$',
          fnc: 'querySearchSchedule'
        }
      ]
    })
  }

  /**
   * 查询相对日期的课表（今天/明天/后天/昨天）
   * @param {Object} e
   */
  async queryRelativeSchedule(e) {
    const match = e.msg.trim().match(/^(今天|明天|后天|昨天)课表$/)
    if (!match) return

    const relative = match[1]
    const targetDate = new Date()
    const offset = { "昨天": -1, "今天": 0, "明天": 1, "后天": 2 }[relative]
    targetDate.setDate(targetDate.getDate() + offset)

    await this.renderDateSchedule(e, targetDate, relative)
  }

  /**
   * 查询指定日期的课表（YYYY-MM-DD课表）
   * @param {Object} e
   */
  async queryDateSchedule(e) {
    const match = e.msg.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return

    const [, year, month, day] = match
    const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    const dateStr = `${year}-${month}-${day}`

    await this.renderDateSchedule(e, targetDate, dateStr)
  }

  /**
   * 查询指定日期的课表（查课表 YYYY-MM-DD）
   * @param {Object} e
   */
  async querySearchSchedule(e) {
    const match = e.msg.trim().match(/查课表\s+(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return

    const [, year, month, day] = match
    const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    const dateStr = `${year}-${month}-${day}`

    await this.renderDateSchedule(e, targetDate, dateStr)
  }

  /**
   * 渲染指定日期的课表
   * @param {Object} e 消息事件
   * @param {Date} targetDate 目标日期
   * @param {string} dateStr 日期显示字符串
   */
  async renderDateSchedule(e, targetDate, dateStr) {
    try {
      const userId = e.user_id
      const filePath = path.join(USER_DATA_DIR, `${userId}.json`)
      
      if (!fs.existsSync(filePath)) {
        await e.reply("你还没有导入课表哦，请先使用WakeUp课程表分享口令导入~")
        return
      }

      if (isNaN(targetDate.getTime())) {
        await e.reply("日期格式不正确")
        return
      }

      // 读取课表数据
      const scheduleData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const schedule = scheduleData.schedule || scheduleData
      const startDate = new Date(scheduleData.startDate || "2025-09-01")

      // 计算周次和星期
      const dayOfWeek = targetDate.getDay() === 0 ? 7 : targetDate.getDay()
      const diffDays = Math.floor((targetDate - startDate) / (1000 * 60 * 60 * 24))
      const week = Math.floor(diffDays / 7) + 1

      // 检查日期有效性
      if (week < 1 || week > (scheduleData.maxWeek || 20)) {
        await e.reply(`${dateStr} 不在本学期范围内（第1-${scheduleData.maxWeek || 20}周）`)
        return
      }

      // 获取当天的课程
      const dayClasses = []
      if (schedule[week] && schedule[week][dayOfWeek]) {
        for (const [node, classes] of Object.entries(schedule[week][dayOfWeek])) {
          for (const cls of classes) {
            dayClasses.push({
              ...cls,
              node: parseInt(node)
            })
          }
        }
      }

      if (dayClasses.length === 0) {
        await e.reply(`${dateStr}（第${week}周 周${["", "一", "二", "三", "四", "五", "六", "日"][dayOfWeek]}）没有课程哦~`)
        return
      }

      // 按节次排序
      dayClasses.sort((a, b) => a.node - b.node)

      // 合并连续相同课程
      const mergedClasses = []
      let current = null
      for (const cls of dayClasses) {
        if (current && 
            current.courseId === cls.courseId && 
            current.courseName === cls.courseName &&
            current.endTime === cls.startTime) {
          current.endTime = cls.endTime
          current.nodeEnd = cls.node
        } else {
          if (current) mergedClasses.push(current)
          current = { ...cls, nodeEnd: cls.node }
        }
      }
      if (current) mergedClasses.push(current)

      // 生成合并转发消息
      const forwardMsgs = []
      const weekDayStr = ["", "一", "二", "三", "四", "五", "六", "日"][dayOfWeek]
      
      forwardMsgs.push(`${dateStr} 课程表\n第${week}周 周${weekDayStr}`)
      
      for (const cls of mergedClasses) {
        const nodeStr = cls.node === cls.nodeEnd ? `第${cls.node}节` : `第${cls.node}-${cls.nodeEnd}节`
        const msg = `📚 ${cls.courseName}\n` +
                   `⏰ ${cls.startTime} - ${cls.endTime}（${nodeStr}）`
        forwardMsgs.push(msg)
      }

      // 发送合并转发
      const common = await import("../../../lib/common/common.js")
      const forwardMsg = await common.default.makeForwardMsg(e, forwardMsgs, `${dateStr} 课程表`, false)
      
      if (forwardMsg) {
        await e.reply(forwardMsg)
      } else {
        await e.reply(forwardMsgs.join("\n---"))
      }

    } catch (error) {
      logger.error(`[ClassTable] 查询日期课表失败: ${error}`)
      await e.reply("查询课表失败，请稍后再试")
    }
  }
}
