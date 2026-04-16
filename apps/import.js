import fs from "node:fs"
import path from "node:path"
import plugin from "../../../lib/plugins/plugin.js"
import { postJson } from "./utils.js"
import config from "../utils/config.js"

const DATA_DIR = path.join("./plugins", "classtable", "data")
const USER_DATA_DIR = path.join("./plugins", "classtable", "data", "users")
const GROUP_DATA_DIR = path.join("./plugins", "classtable", "data", "groups")

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true })
if (!fs.existsSync(GROUP_DATA_DIR)) fs.mkdirSync(GROUP_DATA_DIR, { recursive: true })

export class classtableImport extends plugin {
  constructor() {
    super({
      name: 'classtable:导入课表',
      dsc: '从WakeUp课程表导入课表',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: '^这是来自「WakeUp课程表」的课表分享',
          fnc: 'importSchedule'
        }
      ]
    })
  }

  async importSchedule(e) {
    await e.recall()
    try {
      const match = e.msg.match(/这是来自「WakeUp课程表」的课表分享，30分钟内有效哦，如果失效请朋友再分享一遍叭。为了保护隐私我们选择不监听你的剪贴板，请复制这条消息后，打开App的主界面，右上角第二个按钮 -> 从分享口令导入，按操作提示即可完成导入~分享口令为「(.*)」/)
      if (!match) {
        await e.reply('无法识别分享口令，请确保发送完整的分享口令消息')
        return
      }
      const shareCode = match[1]
      const jsonData = await this.getCourseScheduleFromApi(shareCode)
      if (!jsonData || jsonData.status !== 1 || jsonData.message !== "success" || !jsonData.data) {
        logger.warn(`[ClassTable] 导入课程表失败: ${JSON.stringify(jsonData)}`)
        await e.reply(`尝试导入课程表失败，请检查分享口令是否正确或是否已过期\n\n错误返回值: ${JSON.stringify(jsonData)}`)
        return
      }
      const courseSchedule = this.generateCourseScheduleFromData(jsonData)
      const userId = e.user_id
      const groupId = e.isGroup ? e.group_id : null

      // 保存用户课表数据到 users/${user_id}.json
      const userFilePath = path.join(USER_DATA_DIR, `${userId}.json`)
      fs.writeFileSync(userFilePath, JSON.stringify(courseSchedule, null, 2), 'utf8')
      if (groupId) this.addUserToGroupList(groupId, userId)

      await e.reply(`QwQ导入课程表成功，如果重复导入将会覆盖之前的数据\nBot正在尝试撤回你的口令，如果撤回失败请手动撤回哦~`)

    } catch (err) {
      logger.error(`[ClassTable] 导入课程表失败: ${err}`)
      await e.reply(`课程表功能处理失败，可能是反代服务器炸了，请让Bot主将报错日志发给皮梦检查`)
    }
  }

  /**
   * 添加用户到群组用户列表
   * @param {string} groupId - 群组ID
   * @param {string} userId - 用户ID
   */
  addUserToGroupList(groupId, userId) {
    const groupUserListPath = path.join(GROUP_DATA_DIR, `${groupId}_userlist.json`)
    let userList = []
    if (fs.existsSync(groupUserListPath)) {
      try {
        const content = fs.readFileSync(groupUserListPath, 'utf8')
        userList = JSON.parse(content)
      } catch (err) {
        logger.error(`[ClassTable] 读取群组用户列表失败: ${err}`)
        userList = []
      }
    }
    if (!userList.includes(userId)) {
      userList.push(userId)
      try {
        fs.writeFileSync(groupUserListPath, JSON.stringify(userList, null, 2), 'utf8')
        logger.info(`[ClassTable] 已将用户${userId}添加到群组${groupId}的用户列表`)
      } catch (err) {
        logger.error(`[ClassTable] 保存群组用户列表失败: ${err}`)
      }
    }
  }

  /**
   * 从WakeUp课程表API获取课程表数据
   * @param {*} shareCode 
   * @returns {Object} json数据
   */
  async getCourseScheduleFromApi(shareCode) {
    const url = config.WAKEUP_URL
    const token = config.APITOKEN

    if (!url || !token) {
      throw new Error("classtable 配置缺少 WAKEUP_URL 或 APITOKEN")
    }

    try {
      const responseData = await postJson(url, {
        shareToken: shareCode,
        apiToken: token ? token : null
      }, 5000)

      if (!responseData || responseData.code !== 0 || responseData.message !== 'success' || !responseData.data) {
        return responseData
      }

      const decodedData = Buffer.from(responseData.data, 'base64').toString('utf8')

      return {
        ...responseData,
        status: 1,
        data: decodedData
      }
    } catch (err) {
      logger.error(`[ClassTable] API请求失败: ${err}`)
      throw err
    }
  }

  parseNestedJson(data) {
    const tryBuildLegacyParts = (rawText) => {
      const lines = String(rawText)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      const parsedChunks = []
      for (const line of lines) {
        try {
          parsedChunks.push(JSON.parse(line))
        } catch {
          // 忽略非JSON行（例如说明文本）
        }
      }

      if (parsedChunks.length >= 4) {
        const timeTableIdx = parsedChunks.findIndex((item) => Array.isArray(item) && item.length > 0 && item[0]?.node != null)
        const settingsIdx = parsedChunks.findIndex((item) => !Array.isArray(item) && item && (item.maxWeek != null || item.startDate != null || item.nodes != null))
        const coursesIdx = parsedChunks.findIndex((item) => Array.isArray(item) && item.length > 0 && item[0]?.courseName != null)
        const scheduleIdx = parsedChunks.findIndex((item) => Array.isArray(item) && item.length > 0 && item[0]?.day != null && item[0]?.startNode != null)

        if (timeTableIdx !== -1 && settingsIdx !== -1 && coursesIdx !== -1 && scheduleIdx !== -1) {
          return {
            timeTable: parsedChunks[timeTableIdx],
            settings: parsedChunks[settingsIdx],
            courses: parsedChunks[coursesIdx],
            schedule: parsedChunks[scheduleIdx]
          }
        }

        // fallback
        const lastFour = parsedChunks.slice(-4)
        return {
          timeTable: lastFour[0],
          settings: lastFour[1],
          courses: lastFour[2],
          schedule: lastFour[3]
        }
      }

      return null
    }

    const resolvePayload = (payload, depth = 0) => {
      if (depth > 5 || payload == null) return null

      if (typeof payload === 'object') {
        if (payload.timeTable && payload.settings && payload.courses && payload.schedule) {
          return {
            timeTable: payload.timeTable,
            settings: payload.settings,
            courses: payload.courses,
            schedule: payload.schedule
          }
        }

        if (payload.shareData != null) {
          const resolved = resolvePayload(payload.shareData, depth + 1)
          if (resolved) return resolved
        }

        if (payload.data != null) {
          const resolved = resolvePayload(payload.data, depth + 1)
          if (resolved) return resolved
        }

        return null
      }

      if (typeof payload === 'string') {
        const text = payload.trim()

        // 先尝试把字符串当成JSON解析（兼容外层包裹对象和转义JSON字符串）
        try {
          const parsed = JSON.parse(text)
          const resolved = resolvePayload(parsed, depth + 1)
          if (resolved) return resolved
        } catch {
        }

        const legacy = tryBuildLegacyParts(text)
        if (legacy) return legacy

        // 兼容字面量转义换行（"\\n"）
        if (text.includes('\\n')) {
          const unescaped = text.replace(/\\n/g, '\n')
          const legacyFromEscaped = tryBuildLegacyParts(unescaped)
          if (legacyFromEscaped) return legacyFromEscaped
        }
      }

      return null
    }

    const parsed = resolvePayload(data?.data)
    if (!parsed) {
      throw new Error('课程表数据格式异常，无法解析 timeTable/settings/courses/schedule')
    }

    return parsed
  }

  generateCourseScheduleFromData(data) {
    const parsedData = this.parseNestedJson(data)
    const { courses, schedule, timeTable, settings } = parsedData

    // 建立课程ID到课程信息的映射
    const courseDict = {}
    for (const course of courses) {
      courseDict[course.id] = course
    }

    // 建立节次到时间的映射
    const nodeTimeDict = {}
    for (const item of timeTable) {
      nodeTimeDict[item.node] = item
    }

    // 获取开学日期和最大周数
    const maxWeek = settings.maxWeek || 18
    const startDate = settings.startDate || "2026-03-04" // 从设置中获取开学日期，如果没有则使用默认值

    // 生成完整的课程表数据
    const courseSchedule = []

    for (const scheduleItem of schedule) {
      const courseId = scheduleItem.id
      const courseInfo = courseDict[courseId] || {}
      const { startNode, step, day, startWeek, endWeek, teacher, room, type } = scheduleItem
      const courseName = courseInfo.courseName || "未知课程"
      // type: 0 = 全周, 1 = 单周(odd), 2 = 双周(even)

      // 获取上课的时间段
      const classTimes = []
      // 如果课程使用自定义时间(ownTime为true)，直接使用API提供的时间
      if (scheduleItem.ownTime && scheduleItem.startTime && scheduleItem.endTime) {
        classTimes.push({
          node: startNode,
          startTime: scheduleItem.startTime,
          endTime: scheduleItem.endTime
        })
      } else {
        // 从timeTable根据node查找时间
        for (let i = 0; i < step; i++) {
          const node = startNode + i
          const timeInfo = nodeTimeDict[node] || { startTime: "未知", endTime: "未知" }
          classTimes.push({
            node,
            startTime: timeInfo.startTime,
            endTime: timeInfo.endTime
          })
        }
      }

      // 将课程信息整合
      const courseEntry = {
        courseId,
        courseName,
        day,
        startWeek,
        endWeek,
        classTimes,
        teacher: teacher || '',
        room: room || '',
        type: type || 0
      }

      courseSchedule.push(courseEntry)
    }

    // 按周次、星期和节次整理课程表
    const weeklySchedule = {}
    for (let week = 1; week <= maxWeek; week++) {
      weeklySchedule[week] = {}
    }
    for (const entry of courseSchedule) {
      for (let week = entry.startWeek; week <= entry.endWeek; week++) {
        if (week > maxWeek) continue

        const day = entry.day
        if (day > 7) continue // 忽略无效的星期

        if (!weeklySchedule[week][day]) {
          weeklySchedule[week][day] = {}
        }

        // 处理单双周：type === 1 表示单周(odd)，type === 2 表示双周(even)
        if (entry.type === 1 && (week % 2) === 0) continue
        if (entry.type === 2 && (week % 2) === 1) continue

        for (const time of entry.classTimes) {
          const node = time.node
          if (!weeklySchedule[week][day][node]) {
            weeklySchedule[week][day][node] = []
          }

          weeklySchedule[week][day][node].push({
            courseId: entry.courseId,
            courseName: entry.courseName,
            startTime: time.startTime,
            endTime: time.endTime,
            week: week,
            startWeek: entry.startWeek,
            endWeek: entry.endWeek,
            teacher: entry.teacher || '',
            room: entry.room || '',
            type: entry.type || 0
          })
        }
      }
    }
    const cleanedWeeklySchedule = {}
    for (const [week, days] of Object.entries(weeklySchedule)) {
      if (Object.keys(days).length > 0) {
        cleanedWeeklySchedule[week] = days
      }
    }

    // 添加元数据，包括开学日期
    return {
      schedule: cleanedWeeklySchedule,
      startDate: startDate,
      maxWeek: maxWeek
    }
  }
}
