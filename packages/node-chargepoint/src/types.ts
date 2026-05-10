// ---------------------------------------------------------------------------
// Geographic / config types
// ---------------------------------------------------------------------------

export interface ZoomBounds {
  neLon: number;
  neLat: number;
  swLon: number;
  swLat: number;
}

export interface Country {
  id: number;
  name: string;
  code: string;
  callingCode: number;
  phoneFormat: string;
  zoomBounds: ZoomBounds;
}

export interface Currency {
  code: string;
  name: string;
  cardCost: number;
  symbol: string;
  initialDeposit: number;
  replenishmentThreshold: number;
  maxDecimalPlaces: number;
}

export interface APIEndpoints {
  accountsEndpoint: string;
  internalApiGatewayEndpoint: string;
  mapcacheEndpoint: string;
  pandaWebsocketEndpoint: string;
  paymentJavaEndpoint: string;
  paymentPhpEndpoint: string;
  portalDomainEndpoint: string;
  portalSubdomain: string;
  ssoEndpoint: string;
  webservicesEndpoint: string;
  websocketEndpoint: string;
  hcpoHcmEndpoint: string;
}

export interface GlobalConfiguration {
  region: string;
  defaultCountry: Country;
  supportedCountries: Country[];
  defaultCurrency: Currency;
  supportedCurrencies: Currency[];
  endpoints: APIEndpoints;
}

// ---------------------------------------------------------------------------
// User / account types
// ---------------------------------------------------------------------------

export interface User {
  userId: number;
  email: string;
  username: string;
  fullName: string;
  givenName: string;
  familyName: string;
  phone: string;
  phoneCountryId: number;
  evatarUrl: string;
}

export interface AccountBalance {
  accountNumber: string;
  accountState: string;
  balance: {
    currency: string;
    amount: string;
  };
}

export interface Account {
  user: User;
  accountBalance: AccountBalance;
}

export interface ElectricVehicle {
  make: string;
  model: string;
  year: number;
  primaryVehicle: boolean;
  color: string;
  imageUrl: string;
  chargingSpeed: number;
  dcChargingSpeed: number;
}

// ---------------------------------------------------------------------------
// Power utility types
// ---------------------------------------------------------------------------

export interface PowerUtilityPlan {
  code: string;
  id: number;
  name: string;
  isEvPlan: boolean;
}

export interface PowerUtility {
  id: number;
  name: string;
  plans: PowerUtilityPlan[];
}

// ---------------------------------------------------------------------------
// Home charger types
// ---------------------------------------------------------------------------

export interface HomeChargerStatus {
  chargerId: number;
  brand: string;
  model: string;
  macAddress: string;
  chargingStatus: string;
  isPluggedIn: boolean;
  isConnected: boolean;
  isReminderEnabled: boolean;
  plugInReminderTime: string;
  amperageLimit: number;
  possibleAmperageLimits: number[];
  hasUtilityInfo: boolean;
  isDuringScheduledTime: boolean;
}

export interface HomeChargerTechnicalInfo {
  modelNumber: string;
  serialNumber: string;
  wifiMac: string;
  macAddress: string;
  softwareVersion: string;
  lastOtaUpdate: string;
  lastConnectedAt: string;
  deviceIp: string;
  stopChargeSupported: boolean;
}

export interface LEDBrightness {
  level: number;
  inProgress: boolean;
  supportedLevels: number[];
  isEnabled: boolean;
}

export interface HomeChargerConfiguration {
  serialNumber: string;
  macAddress: string;
  stationNickname: string;
  streetAddress: string;
  hasUtilityInfo: boolean;
  utility: PowerUtility | null;
  indicatorLightEcoMode: boolean;
  flashlightReset: boolean;
  worksWithNest: boolean;
  isPairedWithNest: boolean;
  isInstalledByInstaller: boolean;
  ledBrightness: LEDBrightness;
}

export type TimeString = `${number}:${number}`;

export interface ChargeScheduleWindow {
  startTime: TimeString;
  endTime: TimeString;
  startWeekday?: string;
  endWeekday?: string;
}

export interface StartSessionOptions {
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ChargeSchedule {
  weekdays: ChargeScheduleWindow;
  weekends: ChargeScheduleWindow;
}

export interface HomeChargerSchedule {
  hasTouPricing: boolean;
  scheduleEnabled: boolean;
  hasUtilityInfo: boolean;
  basedOnUtility: PowerUtility | null;
  defaultSchedule: ChargeSchedule;
  userSchedule?: ChargeSchedule;
  utilitySchedule?: ChargeSchedule | null;
}

// ---------------------------------------------------------------------------
// Charging session types
// ---------------------------------------------------------------------------

export interface ChargingSessionUpdate {
  energyKwh: number;
  powerKw: number;
  timestamp: Date;
}

export interface VehicleInfo {
  vehicleId: number;
  batteryCapacity: number;
  make: string;
  model: string;
  year: number;
  evRange: number;
  isPrimaryVehicle: boolean;
}

export interface Station {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

export interface UserChargingStatus {
  sessionId: number;
  startTime: Date;
  state: string;
  stations: Station[];
}

// ---------------------------------------------------------------------------
// Station / map types
// ---------------------------------------------------------------------------

export interface MaxPower {
  unit: string;
  max: number;
}

export interface StationAddress {
  address1: string;
  city: string;
  state: string;
}

export interface StationConnector {
  status: string;
  statusV2: string;
  displayPlugType: string;
  plugType: string;
}

export interface StationPortDetail {
  outletNumber: number;
  status: string;
  statusV2: string;
  displayLevel: number;
  level: number;
  parkingAccessibility: string;
  powerRange: MaxPower;
  connectorList: StationConnector[];
}

export interface StationNetwork {
  name: string;
  displayName: string;
  logoUrl: string;
}

export interface StationPortsInfo {
  totalCount: number;
  availableCount: number;
  ports: StationPortDetail[];
}

export interface StationTouEntry {
  description: string;
  price: number;
}

export interface StationPricingFee {
  amount: number;
  currency: string;
}

export interface StationTax {
  name: string;
  rate: number;
}

export interface StationPrice {
  currencyCode: string;
  touFees: StationTouEntry[];
  guestFee: StationPricingFee | null;
  taxes: StationTax[];
}

export interface StationInfo {
  deviceId: number;
  name: string[];
  address: StationAddress;
  description: string;
  modelNumber: string;
  network: StationNetwork;
  portsInfo: StationPortsInfo;
  stationStatus: string;
  stationStatusV2: string;
  latitude: number;
  longitude: number;
  hostName: string;
  openCloseStatus: string;
  maxPower: MaxPower | null;
  accessRestriction: string;
  parkingAccessibility: string;
  stopChargeSupported: boolean;
  remoteStartCharge: boolean;
  sharedPower: boolean;
  reducedPower: boolean;
  stationPrice: StationPrice | null;
  deviceSoftwareVersion: string;
  lastChargedDate: string;
}

export interface StationPort {
  statusV2: string;
  portType: string;
  outletNumber: number;
  parkingAccessibility: string;
  availablePower: number;
  status: string;
}

export interface MapChargingInfo {
  sessionId: number;
  startTime: Date;
  powerKw: number;
}

export interface MapStation {
  deviceId: number;
  lat: number;
  lon: number;
  name1: string;
  name2: string;
  address1: string;
  city: string;
  networkDisplayName: string;
  networkLogoUrl: string;
  stationStatus: string;
  stationStatusV2: string;
  paymentType: string;
  parkingAccessibility: string;
  totalPortCount: number;
  ports: StationPort[];
  hasL2: boolean;
  maxPower: number;
  currencyIsoCode: string;
  canRemoteStartCharge: boolean;
  companyId: number;
  touStatus: string;
  displayLevel: number;
  waitlistAllowed: boolean;
  accessRestriction: string;
  isHome: boolean;
  chargingStatus: string;
  chargingInfo: MapChargingInfo | null;
}

export interface MapFilter {
  // Parking
  disabledParking?: boolean;
  vanAccessible?: boolean;
  // Networks
  networkChargepoint?: boolean;
  networkEvgo?: boolean;
  networkBlink?: boolean;
  networkFlo?: boolean;
  networkIonna?: boolean;
  networkEvconnect?: boolean;
  networkEvgateway?: boolean;
  networkBchydro?: boolean;
  networkGreenlots?: boolean;
  networkMercedes?: boolean;
  networkCircuitelectric?: boolean;
  // Connectors
  connectorL1?: boolean;
  connectorL2?: boolean;
  connectorL2Nema1450?: boolean;
  connectorL2Tesla?: boolean;
  connectorTesla?: boolean;
  connectorCombo?: boolean;
  connectorChademo?: boolean;
  dcFastCharging?: boolean;
  // Status / pricing
  statusAvailable?: boolean;
  priceFree?: boolean;
}
