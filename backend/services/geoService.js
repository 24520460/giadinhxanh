const GEO_CACHE = new Map();

async function reverseGeocode(lat, lng) {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (GEO_CACHE.has(cacheKey)) {
    return GEO_CACHE.get(cacheKey);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=vi`;
    const fetchRes = await fetch(url, {
      headers: {
        "User-Agent": "GiaDinhXanh/1.0 (contact@giadinhxanh.vn)"
      }
    });

    if (!fetchRes.ok) {
      throw new Error(`Nominatim HTTP ${fetchRes.status}`);
    }

    const data = await fetchRes.json();
    const addr = data.address || {};

    const placeName =
      addr.amenity || addr.building || addr.shop || addr.tourism || addr.office || addr.leisure || "";
    const houseNumber = addr.house_number || "";
    const road = addr.road || addr.street || addr.pedestrian || "";
    const residential = addr.residential || addr.neighbourhood || "";

    let detailedAddress = "";
    if (placeName && road) {
      detailedAddress = `${placeName}, Đường ${road.replace(/^Đường\s+/i, "")}`;
    } else if (placeName) {
      detailedAddress = placeName + (residential ? `, ${residential}` : "");
    } else if (houseNumber && road) {
      detailedAddress = `Số ${houseNumber} Đường ${road.replace(/^Đường\s+/i, "")}`;
    } else if (road) {
      detailedAddress = `Đường ${road.replace(/^Đường\s+/i, "")}`;
    } else if (residential) {
      detailedAddress = residential;
    } else {
      detailedAddress = data.name || (data.display_name ? data.display_name.split(",")[0] : "");
    }

    const wardName = addr.suburb || addr.quarter || addr.village || addr.town || addr.city_district || "";
    const districtName = addr.city_district || addr.county || addr.district || "";
    const provinceName = addr.city || addr.province || addr.state || "";

    const result = {
      ok: true,
      detailed_address: detailedAddress.trim(),
      full_address: data.display_name || detailedAddress,
      ward_name: wardName,
      district_name: districtName,
      province_name: provinceName,
      lat,
      lng,
      raw: addr
    };

    GEO_CACHE.set(cacheKey, result);
    if (GEO_CACHE.size > 200) {
      const firstKey = GEO_CACHE.keys().next().value;
      GEO_CACHE.delete(firstKey);
    }

    return result;
  } catch (err) {
    console.warn("[Reverse Geocode Warning]", err.message);
    return {
      ok: false,
      error: err.message,
      detailed_address: "",
      lat,
      lng
    };
  }
}

module.exports = {
  reverseGeocode
};
