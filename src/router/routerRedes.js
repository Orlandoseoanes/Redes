const express = require('express');
const router = express.Router();
const SubnetCIDRAdviser = require('subnet-cidr-calculator');

// Función para calcular la dirección de broadcast
const getBroadcastAddress = function(subnetCIDR) {
  var subnet = subnetCIDR.split('/');
  var networkAddress = subnet[0];
  var subnetMask = parseInt(subnet[1]);
  
  var networkOctets = networkAddress.split('.').map(Number);
  var broadcastOctets = [];

  for (var i = 0; i < 4; i++) {
    var broadcastOctet = (subnetMask >= 8) ? 255 : ((subnetMask > 0) ? (Math.pow(2, subnetMask) - 1) : 0);
    broadcastOctets.push(broadcastOctet);
    subnetMask -= 8;
  }

  var broadcastAddress = broadcastOctets.join('.');
  return broadcastAddress;
};

// Ruta para obtener las subredes
router.get('/subnets', (req, res) => {
    const { ip: ipAddress, netmaskBits } = req.body;

    // Verificar si la dirección IP y los bits de máscara de red están presentes en la solicitud
    if (!ipAddress || !netmaskBits) {
        return res.status(400).json({ error: 'Se requiere una dirección IP y los bits de máscara de red.' });
    }

    try {
        // Calcular las subredes probables
        const result = SubnetCIDRAdviser.calculate(ipAddress, netmaskBits);
        const subnets = result.subnets;

        // Agregar la dirección de broadcast a cada subred
        subnets.forEach(subnet => {
          subnet.broadcastAddr = getBroadcastAddress(subnet.value);
        });

        // Devolver el resultado como respuesta
        res.json(result);
    } catch (error) {
        console.error('Error al calcular las subredes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

module.exports = router;
