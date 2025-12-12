import fs from "node:fs"
import path from "node:path"
import plugin from "../../lib/plugins/plugin.js"
import puppeteer from "../../lib/puppeteer/puppeteer.js"
import { getMultipleNextClassRenderData, getAllUsersNextClassRenderData } from "./utils/renderNextClass.js"
import { isInClassTime, findConsecutiveClasses, parseTimeString } from "./utils/timeUtils.js"
import { userScheduleCache, getUserScheduleCacheKey, getSkipClassCacheKey } from "./utils/cacheUtils.js"

const DATA_DIR = path.join("./plugins", "classtable", "data")
const USER_DATA_DIR = path.join("./plugins", "classtable", "data", "users")
const GROUP_DATA_DIR = path.join("./plugins", "classtable", "data", "groups")

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export class classtable extends plugin {
  constructor() {
    super({
      name: 'classtable',
      dsc: '课表插件',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: '^课表插件帮助$',
          fnc: 'showMenu'
        },
        {
          reg: '^这是来自「WakeUp课程表」的课表分享',
          fnc: 'importSchedule'
        },
        {
          reg: '^所有群友在上什么课$',
          fnc: 'showAllGroupNextClass'
        },
        {
          reg: '^群友在上什么课$',
          fnc: 'showGroupNextClass'
        },
        {
          reg: '^所有人在上什么课$',
          fnc: 'showAllNextClass'
        },
        {
          reg: '^什么(水|专业|普通|神人|sb)课，翘了！$',
          fnc: 'skipClass'
        },
        {
          reg: '^哎不翘了还是$',
          fnc: 'cancelSkipClass'
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
      
      const base64 = await puppeteer.screenshot(pluginName, {
        saveId: tplName,
        imgType: 'png',
        tplFile,
        pluginResources,
        ...data
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
      `查看群友目前在不在上课：\n` +
      `- 【所有群友在上什么课】- 显示群内所有用户的上课情况\n` +
      `- 【群友在上什么课】- 只显示目前状态中前10的用户\n` +
      `- 【所有人在上什么课】- 显示插件中保存的所有人的上课情况\n` +
      `翘课：发送【什么水课，翘了！】\n` +
      `取消翘课：发送【哎不翘了还是】`
    await this.reply(msg)
  }

  async importSchedule(e) {
    await e.recall()
    try {
      const match = e.msg.match(/这是来自「WakeUp课程表」的课表分享，30分钟内有效哦，如果失效请朋友再分享一遍叭。为了保护隐私我们选择不监听你的剪贴板，请复制这条消息后，打开App的主界面，右上角第二个按钮 -> 从分享口令导入，按操作提示即可完成导入~分享口令为「(.*)」/)
      if (!match) {
        await this.reply('无法识别分享口令，请确保发送完整的分享口令消息')
        return
      }
      const shareCode = match[1]
      const jsonData = await this.getCourseScheduleFromApi(shareCode)
      if (!jsonData || jsonData.status !== 1 || jsonData.message !== "success" || !jsonData.data) {
        logger.warn(`[ClassTable] 导入课程表失败: ${JSON.stringify(jsonData)}`)
        await this.reply(`尝试导入课程表失败，请检查分享口令是否正确或是否已过期\n\n错误返回值: ${JSON.stringify(jsonData)}`)
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
      await this.reply(`QwQ导入课程表成功，如果重复导入将会覆盖之前的数据\nBot正在尝试撤回你的口令，如果撤回失败请手动撤回哦~`)
      
    } catch (err) {
      logger.error(`[ClassTable] 导入课程表失败: ${err}`)
      await this.reply(`课程表功能处理失败，可能是WakeUp课程表APP的服务器问题，请联系开发者处理\n\n错误信息: ${err.message}`)
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

  async getCourseScheduleFromApi(shareCode) {
    const url = `https://i.wakeup.fun/share_schedule/get?key=${shareCode}`
    const headers = {
      "User-Agent": "okhttp/3.14.9",
      "Connection": "Keep-Alive",
      "Accept-Encoding": "gzip",
      "version": "243",
    }
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(url, { 
        headers, 
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
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
    const startDate = settings.startDate || "2025-09-01" // 从设置中获取开学日期，如果没有则使用默认值
    
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
    const result = {
      schedule: cleanedWeeklySchedule,
      startDate: startDate,
      maxWeek: maxWeek
    }
    
    return result
  }

  async showAllGroupNextClass(e) {
    try {
      const renderData = await getMultipleNextClassRenderData(e)
      await this.renderImg('classtable', 'next_class', renderData)
    } catch (error) {
      logger.error(`[ClassTable] 显示群组下一节课失败: ${error}`)
      await this.reply("获取群课表信息时发生错误")
    }
  }

  async showGroupNextClass(e) {
    try {
      const renderData = await getMultipleNextClassRenderData(e, 10)
      await this.renderImg('classtable', 'next_class', renderData)
    } catch (error) {
      logger.error(`[ClassTable] 显示群组下一节课失败: ${error}`)
      await this.reply("获取群课表信息时发生错误")
    }
  }

  async showAllNextClass(e) {
    try {
      const renderData = await getAllUsersNextClassRenderData(e)
      await this.renderImg('classtable', 'next_class', renderData)
    } catch (error) {
      logger.error(`[ClassTable] 显示所有人下一节课失败: ${error}`)
      await this.reply("获取所有人的课表信息时发生错误")
    }
  }

  async skipClass(e) {
    try {
      const userId = e.user_id
      
      // 获取用户当前课程信息
      const filePath = path.join(USER_DATA_DIR, `${userId}.json`)
      if (!fs.existsSync(filePath)) {
        await this.reply("你还没有导入课表，不知道你要翘什么课哦")
        return
      }
      
      const cacheKey = getUserScheduleCacheKey(userId)
      let scheduleData = userScheduleCache.get(cacheKey)
      
      if (!scheduleData) {
        scheduleData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        userScheduleCache.set(cacheKey, scheduleData)
      }
      
      const schedule = scheduleData.schedule || scheduleData
      
      // 获取当前时间
      const currentTime = new Date()
      const currentDay = currentTime.getDay() === 0 ? 7 : currentTime.getDay()
      const currentHour = currentTime.getHours()
      const currentMinute = currentTime.getMinutes()
      
      // 获取当前周次
      const userStartDate = scheduleData.startDate || "2025-09-01"
      const currentWeek = Math.floor((currentTime - new Date(userStartDate)) / (1000 * 60 * 60 * 24 * 7)) + 1
      
      // 查找当前课程或下一节课（最近1小时内有课程）
      let currentClass = null
      let isNextClass = false
      
      // 首先查找当前正在进行的课程
      if (schedule[currentWeek] && schedule[currentWeek][currentDay]) {
        const todayClasses = []
        for (const [node, classes] of Object.entries(schedule[currentWeek][currentDay])) {
          for (const cls of classes) {
            todayClasses.push({
              ...cls,
              node: parseInt(node)
            })
          }
        }
        
        // 按节点排序
        todayClasses.sort((a, b) => a.node - b.node)
        
        // 查找当前正在上的课程
        for (let i = 0; i < todayClasses.length; i++) {
          const cls = todayClasses[i]
          if (isInClassTime(cls.startTime, cls.endTime, currentHour, currentMinute)) {
            // 找到了当前正在上的课程，检查是否有连续的相同课程
            const consecutiveResult = findConsecutiveClasses(todayClasses, i)
            currentClass = {
              ...consecutiveResult.finalClass,
              startTime: consecutiveResult.startTime,
              endTime: consecutiveResult.finalEndTime
            }
            break
          }
        }
      }
      
      // 如果没有当前课程，查找最近1小时内的下一节课
      if (!currentClass) {
        const oneHourLater = new Date(currentTime.getTime() + 60 * 60 * 1000)
        
        if (schedule[currentWeek] && schedule[currentWeek][currentDay]) {
          const todayClasses = []
          for (const [node, classes] of Object.entries(schedule[currentWeek][currentDay])) {
            for (const cls of classes) {
              const [startHour, startMinute] = cls.startTime.split(':').map(Number)
              todayClasses.push({
                ...cls,
                node: parseInt(node),
                startHour,
                startMinute,
                startMinutes: startHour * 60 + startMinute
              })
            }
          }
          
          todayClasses.sort((a, b) => a.node - b.node)
          
          // 查找最近1小时内的课程
          for (let i = 0; i < todayClasses.length; i++) {
            const cls = todayClasses[i]
            const { hour: startHour, minute: startMinute } = parseTimeString(cls.startTime)
            const classTime = new Date(currentTime)
            classTime.setHours(startHour, startMinute, 0, 0)
            
            // 如果课程开始时间在当前时间和1小时后之间
            if (classTime > currentTime && classTime <= oneHourLater) {
              // 找到了下一节课，检查是否有连续的相同课程
              const consecutiveResult = findConsecutiveClasses(todayClasses, i)
              currentClass = {
                ...consecutiveResult.finalClass,
                startTime: consecutiveResult.startTime,
                endTime: consecutiveResult.finalEndTime
              }
              isNextClass = true
              break
            }
          }
        }
      }
      
      if (!currentClass) {
        await this.reply("没课翘不了（")
        return
      }
      
      // 计算课程结束时间
      const { hour: endHour, minute: endMinute } = parseTimeString(currentClass.endTime)
      const endTime = new Date()
      endTime.setHours(endHour, endMinute, 0, 0)
      
      // 如果结束时间已经过了，设置为明天同一时间
      if (endTime <= currentTime) {
        endTime.setDate(endTime.getDate() + 1)
      }
      
      // 计算过期时间（秒）
      const expireTime = Math.floor((endTime - currentTime) / 1000)
      // 在Redis中设置翘课标记
      const skipKey = getSkipClassCacheKey(userId)

      const hasSkip = await redis.get(skipKey)
      if (hasSkip) {
        await this.reply("你已经翘过了")
        return
      }

      await redis.set(skipKey, "1", { EX: expireTime })

      const classType = isNextClass ? "下一节课" : "当前课程"
      await this.reply(`已标记翘课${classType}《${currentClass.courseName}》！翘课状态将持续到${currentClass.endTime}qwq`)
      // await this.reply(`兄弟好翘`)
      
    } catch (error) {
      logger.error(`[ClassTable] 翘课功能失败: ${error}`)
      await this.reply("翘课失败，请稍后再试")
    }
  }

  async cancelSkipClass(e) {
    try {
      const userId = e.user_id
      const skipKey = getSkipClassCacheKey(userId)
      
      // 检查是否存在翘课标记
      const skipStatus = await redis.get(skipKey)
      
      if (!skipStatus) {
        await this.reply("你还没发起翘课哦")
        return
      }
      
      // 删除翘课标记
      await redis.del(skipKey)
      
      await this.reply("已为你取消翘课状态~")
      
    } catch (error) {
      logger.error(`[ClassTable] 取消翘课功能失败: ${error}`)
      await this.reply("取消翘课失败，请稍后再试")
    }
  }
}

logger.mark(`[ClassTable] 插件加载完成`)