import fs from "node:fs"
import path from "node:path"
import fetch from "node-fetch"
import plugin from "../../lib/plugins/plugin.js"
import puppeteer from "../../lib/puppeteer/puppeteer.js"
import { getMultipleNextClassRenderData } from "./utils/renderNextClass.js"

const DATA_DIR = path.join("./plugins", "classtable", "data")
const USER_DATA_DIR = path.join("./plugins", "classtable", "data", "users")
const GROUP_DATA_DIR = path.join("./plugins", "classtable", "data", "groups")

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true })
}
if (!fs.existsSync(GROUP_DATA_DIR)) {
  fs.mkdirSync(GROUP_DATA_DIR, { recursive: true })
}

// 开学日期配置
const SEMESTER_START_DATE = new Date("2025-09-01")

export class classtable extends plugin {
  constructor() {
    super({
      name: 'classtable',
      dsc: '课表插件',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: '^#课表帮助$',
          fnc: 'showMenu'
        },
        {
          reg: '^这是来自「WakeUp课程表」的课表分享',
          fnc: 'importSchedule'
        },
        {
          reg: '^群友在上什么课$',
          fnc: 'showGroupNextClass'
        }
      ]
    })
  }

  /**
   * 渲染图片
   * @param pluginName 插件名称
   * @param tplName 模板名称
   * @param data 渲染数据
   */
  async renderImg(pluginName, tplName, data) {
    try {
      const pluginResources = `./plugins/${pluginName}/resources`
      const tplFile = `${pluginResources}/html/${tplName}.html`
      
      // 将渲染数据直接传递给puppeteer.screenshot，而不是放在data字段中
      const base64 = await puppeteer.screenshot(pluginName, {
        saveId: tplName,
        imgType: 'png',
        tplFile,
        pluginResources,
        ...data  // 将数据对象展开，直接传递给puppeteer
      })
      
      if (base64) {
        await this.reply(base64)
        return true
      }
      return false
    } catch (error) {
      logger.error(`[ClassTable] 渲染图片失败: ${error}`)
      return false
    }
  }

  async showMenu(e) {
    const msg = `本功能通过wakeup课程表APP的API抓包导入\n` +
      `使用方法：\n` +
      `1. 打开wakeup课程表APP，点击右上角按钮\n` +
      `2. 复制分享口令，全部内容直接发送在群里\n` +
      `3. Bot会自动识别并导入课程表\n` +
      `4. 导入成功后，Bot会自动撤回分享口令\n` +
      `查看群友目前在不在上课：发送【群友在上什么课】\n`

    await this.reply(msg)
  }

  async importSchedule(e) {
    try {
      if (e.isGroup) {
        await e.group.recallMsg(e.message_id)
      }
      const match = e.msg.match(/这是来自「WakeUp课程表」的课表分享，30分钟内有效哦，如果失效请朋友再分享一遍叭。为了保护隐私我们选择不监听你的剪贴板，请复制这条消息后，打开App的主界面，右上角第二个按钮 -> 从分享口令导入，按操作提示即可完成导入~分享口令为「(.*)」/)
      if (!match) {
        await this.reply('无法识别分享口令，请确保发送完整的分享口令消息')
        return
      }
      const shareCode = match[1]
      const jsonData = await this.getCourseScheduleFromApi(shareCode)
      if (!jsonData || jsonData.status !== 1 || jsonData.message !== "success" || !jsonData.data) {
        logger.warn(`[ClassTable] 导入课程表失败: ${JSON.stringify(jsonData)}`)
        await this.reply(`导入课程表失败，请检查分享口令是否正确或是否已过期\n\n错误返回值: ${JSON.stringify(jsonData)}`)
        return
      }
      const courseSchedule = this.generateCourseScheduleFromData(jsonData)
      const userId = e.user_id
      const groupId = e.isGroup ? e.group_id : null
      
      // 保存用户课表数据到 users/${user_id}.json
      const userFilePath = path.join(USER_DATA_DIR, `${userId}.json`)
      fs.writeFileSync(userFilePath, JSON.stringify(courseSchedule, null, 2), 'utf8')
      
      // 如果是群组消息，将用户添加到群组用户列表
      if (groupId) {
        this.addUserToGroupList(groupId, userId)
      }
      
      // 隐藏分享码中间部分
      // const maskedShareCode = shareCode.substring(0, 2) + '*'.repeat(shareCode.length - 4) + shareCode.substring(shareCode.length - 2)
      await this.reply(`导入课程表成功，重复导入将会覆盖之前的数据`)
      
    } catch (err) {
      logger.error(`[ClassTable] 导入课程表失败: ${err}`)
      await this.reply(`课程表功能处理失败，可能是wakeup课程表APP的服务器问题，请联系开发者处理\n\n错误信息: ${err.message}`)
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
    
    // 如果文件存在，读取现有用户列表
    if (fs.existsSync(groupUserListPath)) {
      try {
        const content = fs.readFileSync(groupUserListPath, 'utf8')
        userList = JSON.parse(content)
      } catch (err) {
        logger.error(`[ClassTable] 读取群组用户列表失败: ${err}`)
        userList = []
      }
    }
    
    // 如果用户不在列表中，添加用户
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

  getSchedulePath(userId, groupId = null) {
    // 新的存储方式：用户数据统一存储在 users/${user_id}.json
    return path.join(USER_DATA_DIR, `${userId}.json`)
  }

  loadScheduleFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content)
  }

  async getCourseScheduleFromApi(shareCode) {
    const url = `https://i.wakeup.fun/share_schedule/get?key=${shareCode}`
    const headers = {
      "User-Agent": "okhttp/3.14.9",
      "Connection": "Keep-Alive",
      "Accept-Encoding": "gzip",
      "version": "243",
    }
    
    try {
      const response = await fetch(url, { headers, timeout: 5000 })
      return await response.json()
    } catch (err) {
      logger.error(`[ClassTable] API请求失败: ${err}`)
      throw err
    }
  }

  parseNestedJson(data) {
    const nestedJsonStr = data.data
    const parts = nestedJsonStr.split('\n')
    
    return {
      timeTable: JSON.parse(parts[1]),
      settings: JSON.parse(parts[2]),
      courses: JSON.parse(parts[3]),
      schedule: JSON.parse(parts[4])
    }
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
    
    // 生成完整的课程表数据
    const courseSchedule = []
    
    for (const scheduleItem of schedule) {
      const courseId = scheduleItem.id
      const courseInfo = courseDict[courseId] || {}
      const { startNode, step, day, startWeek, endWeek, teacher } = scheduleItem
      const courseName = courseInfo.courseName || "未知课程"
      
      // 获取上课的时间段
      const classTimes = []
      for (let i = 0; i < step; i++) {
        const node = startNode + i
        const timeInfo = nodeTimeDict[node] || { startTime: "未知", endTime: "未知" }
        classTimes.push({
          node,
          startTime: timeInfo.startTime,
          endTime: timeInfo.endTime
        })
      }
      
      // 将课程信息整合
      const courseEntry = {
        courseId,
        courseName,
        day,
        startWeek,
        endWeek,
        teacher,
        classTimes
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
        
        for (const time of entry.classTimes) {
          const node = time.node
          if (!weeklySchedule[week][day][node]) {
            weeklySchedule[week][day][node] = []
          }
          
          weeklySchedule[week][day][node].push({
            courseId: entry.courseId,
            courseName: entry.courseName,
            teacher: entry.teacher,
            startTime: time.startTime,
            endTime: time.endTime,
            week: week,
            startWeek: entry.startWeek,
            endWeek: entry.endWeek
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
    
    return cleanedWeeklySchedule
  }

  // 计算当前周次
  calculateCurrentWeek(startDate, currentDate) {
    const deltaDays = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24))
    return Math.floor(deltaDays / 7) + 1
  }

  // 获取今日课表
  getTodaySchedule(schedule, testTime = null) {
    const currentTime = testTime || new Date()
    const currentWeek = this.calculateCurrentWeek(SEMESTER_START_DATE, currentTime).toString()
    const currentDay = currentTime.getDay() === 0 ? 7 : currentTime.getDay() // 转换为1-7，代表周一到周日
    
    let result = ""
    
    if (schedule[currentWeek] && schedule[currentWeek][currentDay]) {
      const periods = schedule[currentWeek][currentDay]
      result += `今日课表 (周次: ${currentWeek}, 星期: ${currentDay}):\n`
      
      // 按节次排序
      const sortedPeriods = Object.keys(periods).sort((a, b) => parseInt(a) - parseInt(b))
      
      for (const period of sortedPeriods) {
        const classes = periods[period]
        for (const course of classes) {
          result += "====================\n"
          result += `课程: ${course.courseName}\n`
          result += `教师: ${course.teacher}\n`
          result += `时间: ${course.startTime}-${course.endTime}\n`
        }
      }
    } else {
      result += "今日无课程安排。"
    }
    
    return result
  }
  
  async showGroupNextClass(e) {
    try {
      const renderData = await getMultipleNextClassRenderData(e)
      await this.renderImg('classtable', 'next_class', renderData)
    } catch (error) {
      logger.error(`[ClassTable] 显示群组下一节课失败: ${error}`)
      await this.reply("获取群课表信息时发生错误")
    }
  }
}