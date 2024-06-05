const express = require('express');
const router = express.Router();
const SubnetCIDRAdviser = require('subnet-cidr-calculator');

router.get('/subnets', (req, res) => {
  const { ip: ipAddress, netmaskBits, numSubnets } = req.body;

  // Verificar si se proporcionan la dirección IP, los bits de máscara de red y el número de subredes
  if (!ipAddress || !netmaskBits || !numSubnets) {
      return res.status(400).json({ error: 'Se requiere la dirección IP, los bits de máscara de red y el número de subredes.' });
  }

  try {
      // Calcular los bits adicionales necesarios para crear las subredes
      const additionalBits = Math.ceil(Math.log2(numSubnets));
      const newNetmaskBits = netmaskBits + additionalBits;

      if (newNetmaskBits > 32) {
          return res.status(400).json({ error: 'Número de subredes excesivo para la máscara de red proporcionada.' });
      }

      // Calcular las subredes probables con la nueva submáscara
      const result = SubnetCIDRAdviser.calculate(ipAddress, newNetmaskBits);
      const subnets = result.subnets.slice(0, numSubnets); // Obtener solo el número requerido de subredes

      // Formatear las subredes con la dirección de broadcast
      const formattedSubnets = subnets.map(subnet => {
          const { value, ipRange, range } = subnet;
          const broadcastAddr = calculateBroadcast(ipRange.start, ipRange.end, newNetmaskBits);
          return { value, ipRange, range, broadcastAddr };
      });

      // Agrupar las subredes en el objeto de respuesta
      const groupedSubnetsObj = {};
      formattedSubnets.forEach((subnet, index) => {
          groupedSubnetsObj[`subred${index + 1}`] = [subnet];
      });

      // Devolver las subredes agrupadas como respuesta
      res.json(groupedSubnetsObj);
  } catch (error) {
      console.error('Error al calcular las subredes:', error);
      res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Función para calcular la dirección de broadcast de una subred
function calculateBroadcast(ipStart, ipEnd, netmaskBits) {
  const ipPartsStart = ipStart.split('.').map(Number);
  const ipPartsEnd = ipEnd.split('.').map(Number);
  const netmaskParts = calculateNetmask(netmaskBits).split('.').map(Number);

  // Calcular la dirección de broadcast para la subred
  const broadcastParts = [];
  for (let i = 0; i < 4; i++) {
      broadcastParts.push(ipPartsEnd[i] | ~netmaskParts[i]);
  }

  // Devolver la dirección de broadcast de la subred
  const broadcastAddr = broadcastParts.map(part => part & 255).join('.');
  return broadcastAddr;
}

// Función para calcular la máscara de red
function calculateNetmask(netmaskBits) {
    const mask = [];
    for (let i = 0; i < 4; i++) {
        if (netmaskBits >= 8) {
            mask.push(255);
            netmaskBits -= 8;
        } else {
            mask.push(256 - Math.pow(2, 8 - netmaskBits));
            netmaskBits = 0;
        }
    }
    return mask.join('.');
}

module.exports = router;
