/**
 * 时间处理工具函数
 */

/**
 * 解析时间字符串 (HH:MM) 为小时和分钟
 * @param {string} timeStr - 时间字符串
 * @returns {Object} 包含小时和分钟的对象
 */
export function parseTimeString(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number)
  return { hour, minute }
}

/**
 * 计算两个时间点之间的间隔（分钟）
 * @param {string} time1 - 第一个时间字符串 (HH:MM)
 * @param {string} time2 - 第二个时间字符串 (HH:MM)
 * @returns {number} 时间间隔（分钟）
 */
export function calculateTimeInterval(time1, time2) {
  const { hour: hour1, minute: minute1 } = parseTimeString(time1)
  const { hour: hour2, minute: minute2 } = parseTimeString(time2)
  
  const totalMinutes1 = hour1 * 60 + minute1
  const totalMinutes2 = hour2 * 60 + minute2
  
  return totalMinutes2 - totalMinutes1
}

/**
 * 检查当前时间是否在课程时间范围内
 * @param {string} startTime - 课程开始时间 (HH:MM)
 * @param {string} endTime - 课程结束时间 (HH:MM)
 * @param {number} currentHour - 当前小时
 * @param {number} currentMinute - 当前分钟
 * @returns {boolean} 是否在课程时间内
 */
export function isInClassTime(startTime, endTime, currentHour, currentMinute) {
  const { hour: startHour, minute: startMinute } = parseTimeString(startTime)
  const { hour: endHour, minute: endMinute } = parseTimeString(endTime)
  
  const afterStart = (currentHour > startHour) || (currentHour === startHour && currentMinute >= startMinute)
  const beforeEnd = (currentHour < endHour) || (currentHour === endHour && currentMinute < endMinute)
  
  return afterStart && beforeEnd
}

/**
 * 查找连续的相同课程
 * @param {Array} classes - 今日课程列表
 * @param {number} startIndex - 开始查找的索引
 * @param {number} maxInterval - 最大间隔时间（分钟），默认30分钟
 * @returns {Object} 包含最终课程信息和结束时间的对象
 */
export function findConsecutiveClasses(classes, startIndex, maxInterval = 30) {
  const startClass = classes[startIndex]
  let finalEndTime = startClass.endTime
  let finalClass = startClass
  
  // 向后查找连续的相同课程
  for (let j = startIndex + 1; j < classes.length; j++) {
    const nextClass = classes[j]
    
    // 检查课程名称是否相同
    if (nextClass.courseName === startClass.courseName) {
      // 计算两节课之间的间隔时间（分钟）
      const interval = calculateTimeInterval(finalEndTime, nextClass.startTime)
      
      // 如果间隔不超过maxInterval分钟，认为是连续课程
      if (interval <= maxInterval) {
        finalEndTime = nextClass.endTime
        finalClass = nextClass
      } else {
        // 间隔超过maxInterval分钟，不再认为是连续课程
        break
      }
    } else {
      // 课程名称不同，停止查找
      break
    }
  }
  
  return {
    finalClass,
    finalEndTime,
    startTime: startClass.startTime
  }
}

/**
 * 将时间字符串转换为分钟数
 * @param {string} timeStr - 时间字符串 (HH:MM)
 * @returns {number} 总分钟数
 */
export function timeToMinutes(timeStr) {
  const { hour, minute } = parseTimeString(timeStr)
  return hour * 60 + minute
}

/**
 * 获取当前时间的分钟表示
 * @param {number} currentHour - 当前小时
 * @param {number} currentMinute - 当前分钟
 * @returns {number} 当前时间的总分钟数
 */
export function getCurrentTimeMinutes(currentHour, currentMinute) {
  return currentHour * 60 + currentMinute
}

export default {
  parseTimeString,
  calculateTimeInterval,
  isInClassTime,
  findConsecutiveClasses,
  timeToMinutes,
  getCurrentTimeMinutes
}