const dgram = require('dgram')
const os = require('os')
const { Netmask } = require('netmask')

const pkgData = require('./package.json')

// https://rietman.wordpress.com/2016/09/16/the-light-weight-ethernet-lwe-implementation-in-nemastudio/
// https://furunousa.com/-/media/sites/furuno/document_library/documents/manuals/public_manuals/far3000_settings_and_adjustments_manual.pdf

const MULTICASTPREFIX = 'UdPbC\0'
const MAXLINECOUNT = 1000

module.exports = function (app) {
  let socket
  let onStop = []

  return {
    start: options => {
      app.debug(options)
      let talkers = loadTalkers()
      if (options.ipaddress) {
        socket = dgram.createSocket('udp4')
        socket.bind(function(){
          socket.setMulticastInterface(options.ipaddress)
        })
        createTagBlock.lineCount = 0

        const send = originalMessage => {
          let talkerId = originalMessage.substring(1, 3)
          let newMessage = ''
          if (talkerId in talkers) {
            newMessage += createPrefix(options)
            newMessage += createTagBlock(options)
            newMessage += originalMessage + '\r\n'
            app.debug(JSON.stringify(`Multicasting ${newMessage} to ${talkers[talkerId].address}:${talkers[talkerId].port}`))
            socket.send(newMessage, 0, newMessage.length, talkers[talkerId].port, talkers[talkerId].address)
          }
        }

        if (typeof options.nmea0183 === 'undefined' || options.nmea0183) {
          app.signalk.on('nmea0183', send)
          onStop.push(() => {
            app.signalk.removeListener('nmea0183', send)
          })
        }
        if (typeof options.nmea0183out === 'undefined' || options.nmea0183out) {
          app.on('nmea0183out', send)
          onStop.push(() => {
            app.removeListener('nmea0183out', send)
          })
        }
        app.setProviderStatus(`Using interface with address ${options.ipaddress}`)
      } else {
        app.setProviderError('No address specified')
      }
    },
    stop: () => {
      onStop.forEach(f => f())
      onStop = []
      if (socket) {
        socket.close()
        socket = undefined
      }
    },
    schema,
    id: 'NMEA0183-IEC61162-450-server-plugin',
    name: pkgData.description
  }
}

function schema () {
  return {
    type: 'object',
    properties: {
      ipaddress: {
        type: 'string',
        title: 'IP address of the interface to send the multicast messages on.'
      },
      nmea0183: {
        type: 'boolean',
        title: 'Use server event nmea0183',
        default: true
      },
      nmea0183out: {
        type: 'boolean',
        title: 'Use server event nmea0183out',
        default: true
      },
      includeMulticastPrefix: {
        type: 'boolean',
        title: 'Prefix sentences with ' + JSON.stringify(MULTICASTPREFIX) + ' string according IEC61162-450',
        default: true
      },
      includeTimestampInTag: {
        type: 'boolean',
        title: 'Include c: timestamp in TAG block',
        default: true
      },
      includeLineCountInTag: {
        type: 'boolean',
        title: 'Include n: line count in TAG block',
        default: false
      },
      tagDestinationIdentification: {
        type: 'string',
        title: 'Set d: destination identification in TAG block',
        default: ''
      },
      tagSourceIdentification: {
        type: 'string',
        title: 'Set s: source identification in TAG block',
        default: 'SK0001'
      }
    }
  }
}

function loadTalkers() {
  let fs = require("fs")
  let path = require('path')
  let talkers = {}
  let transmissionGroups = JSON.parse(fs.readFileSync(path.join(__dirname, 'transmissiongroups.json')))
  for (let key in transmissionGroups) {
    transmissionGroups[key].talkers.forEach(
      talkerId => {
        talkers[talkerId] = {
          address: transmissionGroups[key].address,
          port: transmissionGroups[key].port
        }
      }
    )
  }
  return talkers
}

function createPrefix(options) {
  if (options.includeMulticastPrefix) {
    return MULTICASTPREFIX
  }
  return ''
}

function createTagBlock(options) {
  let tagBlock = ''
  if (options.tagDestinationIdentification) {
    tagBlock += 'd:' + options.tagDestinationIdentification + ','
  }
  if (options.tagSourceIdentification) {
    tagBlock += 's:' + options.tagSourceIdentification + ','
  }
  if (options.includeTimestampInTag) {
    tagBlock += 'c:' + Date.now() + ','
  }
  if (options.includeLineCountInTag) {
    tagBlock += 'n:' + createTagBlock.lineCount++ + ','
    if (createTagBlock.lineCount >= MAXLINECOUNT) {
      createTagBlock.lineCount = 0
    }
  }

  // return the tagBlock if it's empty
  if (tagBlock.length == 0) {
    return tagBlock
  }

  tagBlock = tagBlock.slice(0, - 1)
  let tagBlockChecksum = 0
  for (let i = 0; i < tagBlock.length; i++) {
    tagBlockChecksum ^= tagBlock.charCodeAt(i)
  }
  return `\\${tagBlock}*${tagBlockChecksum.toString(16)}\\`
}
