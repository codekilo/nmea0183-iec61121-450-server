const dgram = require('dgram')
const os = require('os')
const { Netmask } = require('netmask')

const pkgData = require('./package.json')

// https://rietman.wordpress.com/2016/09/16/the-light-weight-ethernet-lwe-implementation-in-nemastudio/
// https://furunousa.com/-/media/sites/furuno/document_library/documents/manuals/public_manuals/far3000_settings_and_adjustments_manual.pdf
const TRANSMISSIONGROUPS = {
  MISC: {
    TALKERS: ['BI', 'DU', 'ER', 'II', 'NL', 'RC', 'SG', 'SS', 'UP', 'U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'VR', 'YX', 'SI'],
    ADDRESS: '239.192.0.1',
    PORT: 60001
  },
  TGTD: {
    TALKERS: ['AI', 'RA'],
    ADDRESS: '239.192.0.2',
    PORT: 60002
  },
  SATD: {
    TALKERS: ['HE', 'HN', 'TI'],
    ADDRESS: '239.192.0.3',
    PORT: 60003
  },
  NAVD: {
    TALKERS: ['AG', 'AP', 'DF', 'EC', 'EI', 'GA', 'GP', 'GL', 'GN', 'HC', 'HF', 'IN', 'LC', 'SD', 'SN', 'VD', 'VM', 'VW', 'WI'],
    ADDRESS: '239.192.0.4',
    PORT: 60004
  },
  VDRD: {
    TALKERS: ['BN', 'FD', 'FE', 'FR', 'FS', 'HD', 'HS', 'WD', 'WL'],
    ADDRESS: '239.192.0.5',
    PORT: 60005
  },
  RCOM: {
    TALKERS: ['CD', 'CR', 'CS', 'CT', 'CV', 'CX', 'EP'],
    ADDRESS: '239.192.0.6',
    PORT: 60006
  },
  TIME: {
    TALKERS: ['ZA', 'ZC', 'ZQ', 'ZV'],
    ADDRESS: '239.192.0.7',
    PORT: 60007
  },
  PROP: {
    TALKERS: [],
    ADDRESS: '239.192.0.8',
    PORT: 60008
  },
  USR1: {
    TALKERS: [],
    ADDRESS: '239.192.0.9',
    PORT: 60009
  },
  USR2: {
    TALKERS: [],
    ADDRESS: '239.192.0.10',
    PORT: 60010
  },
  USR3: {
    TALKERS: [],
    ADDRESS: '239.192.0.11',
    PORT: 60011
  },
  USR4: {
    TALKERS: [],
    ADDRESS: '239.192.0.12',
    PORT: 60012
  },
  USR5: {
    TALKERS: [],
    ADDRESS: '239.192.0.13',
    PORT: 60013
  },
  USR6: {
    TALKERS: [],
    ADDRESS: '239.192.0.14',
    PORT: 60014
  },
  USR7: {
    TALKERS: [],
    ADDRESS: '239.192.0.15',
    PORT: 60015
  },
  USR8: {
    TALKERS: [],
    ADDRESS: '239.192.0.16',
    PORT: 60016
  },
}
const MULTICASTPREFIX = 'UdPbC\0'
const MAXLINECOUNT = 1000

module.exports = function (app) {
  let socket
  let onStop = []

  return {
    start: options => {
      app.debug(options)
      const address = options.ipaddress
      if (address) {
        socket = dgram.createSocket('udp4')
        socket.bind(function(){
          socket.setMulticastInterface(address)
        })

        createTagBlock.lineCount = 0
        const send = originalMessage => {
          transmissionGroup = findTransmissionGroup(originalMessage)
          let newMessage = ''
          if (transmissionGroup) {
            newMessage += createPrefix(options)
            newMessage += createTagBlock(options)
            newMessage += originalMessage + '\r\n'
            app.debug(`Multicasting ${newMessage} to ${transmissionGroup.ADDRESS}:${transmissionGroup.PORT}`)
            socket.send(newMessage, 0, newMessage.length, transmissionGroup.PORT, transmissionGroup.ADDRESS)
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
        app.setProviderStatus(`Using interface with address ${address}`)
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
        title: 'Prefix sentences with ' + MULTICASTPREFIX + ' string according IEC61162-450',
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

function findTransmissionGroup(originalMessage) {
  let talkerId = originalMessage.substring(1, 3)
  return Object.values(TRANSMISSIONGROUPS).find(group => group.TALKERS.includes(talkerId))
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
