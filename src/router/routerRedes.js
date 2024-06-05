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
      // Calcular las subredes probables
      const result = SubnetCIDRAdviser.calculate(ipAddress, netmaskBits);
      const subnets = result.subnets;

      // Calcular la cantidad de subredes por grupo
      const subnetsPerGroup = Math.ceil(subnets.length / numSubnets);

      // Agrupar las subredes según el número especificado
      const groupedSubnets = [];
      for (let i = 0; i < subnets.length; i += subnetsPerGroup) {
          const group = subnets.slice(i, i + subnetsPerGroup);
          const formattedGroup = group.map(subnet => {
              const { value, ipRange, range } = subnet;
              const broadcastAddr = calculateBroadcast(ipRange.start, ipRange.end, netmaskBits);
              return { value, ipRange, range, broadcastAddr };
          });
          groupedSubnets.push(formattedGroup);
      }

      // Crear un objeto con las subredes agrupadas
      const groupedSubnetsObj = {};
      groupedSubnets.forEach((group, index) => {
          groupedSubnetsObj[`subred${index + 1}`] = group;
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
