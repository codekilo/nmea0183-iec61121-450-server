# nmea0183 iec61121-450 server
Send UDP multicast NMEA sentences according to IEC61162-450

This plugin can send NMEA messages to the correct multicast address/port number based on the talker id of the message. The plugin can be configured to include the UdPbC\0 and to create a TAG block which can include a timestamp, source identifier and destination identifier.
