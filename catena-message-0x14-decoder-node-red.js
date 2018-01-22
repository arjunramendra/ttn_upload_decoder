// JavaScript source code
// This Node-RED decoding function decodes the record sent by the Catena 4450
// M101 power monitor application.
// Written in a big hurry, so no points for style

var b = msg.payload;  // pick up data for convenience; just saves typing.

// an empty table to which we'll add result fields:
//
// result.vBat: the battery voltage (if present)
// result.vBus: the USB charger voltage (if provided)
// result.boot: the system boot counter, modulo 256
// result.t: temperature in degrees C
// result.p: station pressure in hPa (millibars). Note that this is not
//   adjusted for the height above sealevel so can't be directly compared
//   to weather.gov "barometric pressure"
// result.rh: relative humidity (in %)
// result.lux: light level, in lux
// result.powerUsed: pulses from the WH pulse meter (consumption)
// result.powerRev: pulese from the WH pulse meter (sourced to the grid)
// result.powerUsedDeriv: derivative of total power used over the last
//    sample period, normalised to kWh / hour (in other words, kW).
// result.powerRevDeriv: derivative of total power sourced over the
//    last sample period, normalized to kWh/hour.
var result = {};

// check the message type byte
if (b[0] != 0x14) {
    // not one of ours: report an error, return without a value,
    // so that Node-RED doesn't propagate the message any further.
    node.error("not ours! " + b[0].toString());
    return;
}

// i is used as the index into the message. Start with the flag byte.
var i = 1;
// fetch the bitmap.
var flags = b[i++];

if (flags & 0x1) {
    // set vRaw to a uint16, and increment pointer
    var vRaw = (b[i] << 8) + b[i + 1];
    i += 2;
    // interpret uint16 as an int16 instead.
    if (vRaw & 0x8000)
        vRaw += -0x10000;
    // scale and save in result.
    result.vBat = vRaw / 4096.0;
}

if (flags & 0x2) {
    var vRaw = (b[i] << 8) + b[i + 1];
    i += 2;
    if (vRaw & 0x8000)
        vRaw += -0x10000;
    result.vBus = vRaw / 4096.0;
}

if (flags & 0x4) {
    var iBoot = b[i];
    i += 1;
    result.boot = iBoot;
}

if (flags & 0x8) {
    // we have temp, pressure, RH
    var tRaw = (b[i] << 8) + b[i + 1];
    if (tRaw & 0x8000)
        tRaw = -0x10000 + tRaw;
    i += 2;
    var pRaw = (b[i] << 8) + b[i + 1];
    i += 2;
    var hRaw = b[i++];
	
	var gRaw = b[i];
	
	i+=2;

    result.t = tRaw / 256;
    result.p = pRaw * 4 / 100.0;
    result.rh = hRaw / 256 * 100;
	result.g = gRaw * 4 / 100.0;
}

if (flags & 0x10) {
    // we have lux
    var luxRaw = (b[i] << 8) + b[i + 1];
    i += 2;
    result.lux = luxRaw;
}


if (flags & 0x20)   // watthour
{
    var powerIn = (b[i] << 8) + b[i + 1];
    i += 2;
    var powerOut = (b[i] << 8) + b[i + 1];
    i += 2;
    result.powerUsed = powerIn;
    result.powerRev = powerOut;
}

if (flags & 0x40)  // normalize floating pulses per hour
{
    var floatIn = (b[i] << 8) + b[i + 1];
    i += 2;
    var floatOut = (b[i] << 8) + b[i + 1];
    i += 2;

    var exp1 = floatIn >> 12;
    var exp2 = floatOut >> 12;
    var mant1 = (floatIn & 0xFFF) / 4096.0;
    var mant2 = (floatOut & 0xFFF) / 4096.0;
    var powerPerHourIn = mant1 * Math.pow(2, exp1 - 15) * 60 * 60 * 4;
    var powerPerHourOut = mant2 * Math.pow(2, exp2 - 15) * 60 * 60 * 4;
    result.powerUsedDeriv = powerPerHourIn;
    result.powerRevDeriv = powerPerHourOut;
}

// now update msg with the new payload and new .local field
// the old msg.payload is overwritten.
msg.payload = result;
msg.local =
    {
        nodeType: "Catena 4450-M101",
        platformType: "Feather M0 LoRa",
        radioType: "RF95",
        applicationName: "AC Power Monitoring"
    };

return msg;
