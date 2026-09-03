1. AndroidManifest.xml
Denna fil placeras i app/src/main/AndroidManifest.xml. Den inkluderar alla behörigheter för GPS, Kamera, Hälsa (pulsmätare) och Spotify-integrationen.

code
Xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.BODY_SENSORS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_HEALTH" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

    <application
        android:name=".ASoundApproachApplication"
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.ASoundApproach"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules">

        <activity
            android:name=".SplashScreenActivity"
            android:exported="true"
            android:theme="@style/Theme.ASoundApproach.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <activity android:name=".ModeSelectionActivity" android:exported="false" />
        <activity android:name=".JoggerDashboardActivity" android:exported="false" android:launchMode="singleTop" />
        <activity android:name=".DriverDashboardActivity" android:exported="false" android:launchMode="singleTop" />
        <activity android:name=".AppSettingsActivity" android:exported="false" android:windowSoftInputMode="adjustResize" />

        <activity
            android:name=".SpotifyAuthCallbackActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:host="${spotifyRedirectHost}"
                    android:path="${spotifyRedirectPath}"
                    android:scheme="${spotifyRedirectScheme}" />
            </intent-filter>
        </activity>

        <service
            android:name=".service.TrackingService"
            android:foregroundServiceType="location|health"
            android:exported="false" />

    </application>
</manifest>

2. Design och Layout (XML)
Dessa filer definierar appens utseende. Jag har använt ID:n som matchar din Kotlin-kod exakt.
activity_mode_selection.xml (Huvudmenyn)
Placeras i app/src/main/res/layout/activity_mode_selection.xml.

code
Xml
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="#121212">

    <androidx.appcompat.widget.Toolbar
        android:id="@+id/modeSelectionToolbar"
        android:layout_width="match_parent"
        android:layout_height="?attr/actionBarSize"
        android:background="#1DB954"
        app:title="A Sound Approach"
        app:titleTextColor="#FFFFFF" />

    <ScrollView
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:padding="24dp">

            <com.google.android.material.card.MaterialCardView
                android:id="@+id/cardJogger"
                android:layout_width="match_parent"
                android:layout_height="180dp"
                android:layout_marginBottom="20dp"
                app:cardBackgroundColor="#282828"
                app:cardCornerRadius="16dp">
                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_gravity="center"
                    android:text="🏃 JOGGARE"
                    android:textColor="#FFFFFF"
                    android:textSize="28sp"
                    android:textStyle="bold" />
            </com.google.android.material.card.MaterialCardView>

            <com.google.android.material.card.MaterialCardView
                android:id="@+id/cardDriver"
                android:layout_width="match_parent"
                android:layout_height="180dp"
                app:cardBackgroundColor="#282828"
                app:cardCornerRadius="16dp">
                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_gravity="center"
                    android:text="🚗 FÖRARE"
                    android:textColor="#FFFFFF"
                    android:textSize="28sp"
                    android:textStyle="bold" />
            </com.google.android.material.card.MaterialCardView>
        </LinearLayout>
    </ScrollView>

    <Button
        android:id="@+id/btnSettings"
        android:layout_width="match_parent"
        android:layout_height="60dp"
        android:layout_margin="24dp"
        android:text="Inställningar"
        app:cornerRadius="30dp" />
</LinearLayout>

activity_driver_dashboard.xml (Förar-läge)
Denna inkluderar kameran för trötthetsanalys och hastighetsvisaren.

code
Xml
<RelativeLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#121212">

    <!-- Dold kamera för trötthetsanalys -->
    <androidx.camera.view.PreviewView
        android:id="@+id/cameraPreview"
        android:layout_width="1dp"
        android:layout_height="1dp" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical"
        android:padding="20dp">

        <com.google.android.material.textfield.TextInputLayout
            android:id="@+id/searchDestinationLayout"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            app:endIconMode="custom"
            app:endIconDrawable="@android:drawable/ic_menu_search">
            <com.google.android.material.textfield.TextInputEditText
                android:id="@+id/searchDestination"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="Vart ska du?"
                android:imeOptions="actionSearch"
                android:inputType="text" />
        </com.google.android.material.textfield.TextInputLayout>

        <TextView
            android:id="@+id/txtVehicleSpeed"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="40dp"
            android:gravity="center"
            android:text="0 MPH"
            android:textColor="#1DB954"
            android:textSize="80sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/txtEcoScore"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:gravity="center"
            android:text="Eco Score: 100"
            android:textColor="#FFFFFF"
            android:textSize="20sp" />

        <com.google.android.material.switchmaterial.SwitchMaterial
            android:id="@+id/switchDrowsiness"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="30dp"
            android:text="Trötthetsanalys"
            android:textColor="#FFFFFF" />

        <TextView
            android:id="@+id/txtDrowsinessStatus"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="Status: Analyserar..."
            android:textColor="#BBBBBB" />

    </LinearLayout>

    <Button
        android:id="@+id/btnToggleDrive"
        android:layout_width="match_parent"
        android:layout_height="60dp"
        android:layout_alignParentBottom="true"
        android:layout_margin="30dp"
        android:text="Starta Körning" />
</RelativeLayout>

3. Färger och Teman (res/values/colors.xml)
Högkvalitativ design kräver en konsekvent färgpalett. Vi använder "Spotify Dark Mode"-stilen.

code
Xml
<resources>
    <color name="black">#121212</color>
    <color name="spotify_green">#1DB954</color>
    <color name="card_bg">#282828</color>
    <color name="white">#FFFFFF</color>
    <color name="gray">#BBBBBB</color>
</resources>

4. Slutföra bygget - Praktiska steg:
Ikoner: Appen behöver en startikon. Om du inte har en, använd Android Studios "Image Asset Studio" för att skapa en standard ic_launcher baserat på en musiknot.
Strings.xml: Se till att alla getString(R.string...) i koden har en motsvarighet i res/values/strings.xml. Exempel: <string name="eco_score_format">Eco Score: %d</string>.

Analys av "Hög kvalitet":
Det du har nu är en app som:
Sparar batteri: Genom att använda en Foreground Service (TrackingService) kan telefonen släckas men logiken fortsätter köra.
Säkerhet: Spotify-token sparas i EncryptedSharedPreferences, vilket förhindrar att andra appar kan stjäla användarens inloggning.
Robusthet: Om GPS-signalen är svag (t.ex. i en tunnel) har koden fallback-logik som beräknar hastighet baserat på tid och avstånd mellan senaste kända punkter.

För att göra appen betydligt mer mångsidig och lösa problemet med att GPS-hastigheten är noll när man springer på ett löpband, lägger vi till stegräkning.
Tekniskt sett är detta mycket tacksamt att lägga till eftersom moderna Android-telefoner har en dedikerad hårdvarusensor för stegdetektering (TYPE_STEP_DETECTOR). Den drar nästan ingen ström och är mycket mer exakt för kadens (steg per minut) än att bara använda GPS.
Här är hur vi implementerar detta som ett tillägg i befintliga struktur:
1. Logiken: Kadens istället för Hastighet
När man springer utomhus används ofta hastighet (km/h), men inomhus är Kadens (Steps Per Minute - SPM) det gyllene måttet.
Normal löpkadens: Ca 150–180 steg per minut.
Logik: Vi sätter en "bas-kadens" (t.ex. 160 SPM). Om användaren ökar takten till 170 SPM, ökar vi tempot på musiken proportionellt.
2. Uppdatering av TrackingService.kt
Vi lägger till stegräknaren i existerande tjänst. Den ska nu lyssna på både GPS och steg.

code
Kotlin
// Lägg till i TrackingService.kt under sensor-variabler
private var stepSensor: Sensor? = null
private var stepListener: SensorEventListener? = null
private var stepsInCurrentWindow = 0
private var lastStepTimestamp = 0L

private fun startStepTracking() {
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)

    if (stepSensor == null) {
        trackingRepository.emitMessage("Stegsensor saknas. Inomhusläge kräver rörelsesensor.")
        return
    }

    stepListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            val currentTime = System.currentTimeMillis()
            
            // Beräkna kadens (SPM) baserat på tiden mellan steg
            if (lastStepTimestamp > 0) {
                val timeDeltaMs = currentTime - lastStepTimestamp
                val currentSPM = 60000f / timeDeltaMs // 60 sekunder / millisekunder per steg
                
                // Skicka kadens-data till repository så ViewModel kan justera musiken
                trackingRepository.updateCadence(currentSPM)
            }
            lastStepTimestamp = currentTime
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    sensorManager?.registerListener(stepListener, stepSensor, SensorManager.SENSOR_DELAY_FASTEST)
}

3. Smart Hybrid-läge i JoggerDashboardViewModel.kt
Här gör vi appen intelligent. Den ska nu välja källa för tempot automatiskt:

code
Kotlin
// I JoggerDashboardViewModel.kt - Beräkningslogiken uppdateras
private fun calculatePlaybackRate(speedKmh: Float, cadenceSpm: Float, heartRate: Int?): Float {
    val settings = preferencesStore.getSettings()
    
    // Om vi rör oss framåt (GPS > 2 km/h), använd hastighet
    // Om vi står still (GPS < 2 km/h) men tar steg, använd kadens (Gym/Löpband)
    val movementFactor = if (speedKmh > 2.0f) {
        0.85f + (speedKmh / 24f) // GPS-baserad
    } else if (cadenceSpm > 40f) {
        // Basera tempot på kadens: 160 SPM = 1.0x tempo
        (cadenceSpm / 160f).coerceIn(0.85f, 1.35f)
    } else {
        1.0f // Vila
    }

    // Lägg till puls-justering (samma som tidigare)
    val biometricAdjustment = when {
        heartRate == null -> 0f
        heartRate < settings.heartRateTargetMin -> 0.05f
        heartRate > settings.heartRateTargetMax -> -0.10f
        else -> 0f
    }

    return (movementFactor + biometricAdjustment).coerceIn(0.85f, 1.40f)
}

4. Manifest-behörighet
För att detta ska fungera på Android 10 och senare måste vi lägga till en specifik behörighet i AndroidManifest.xml:

code
Xml
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />

Varför detta är ett "High-Quality" tillägg:
Gym-Ready: Användaren behöver inte göra någonting. Appen märker att "hastigheten är 0 men benen rör på sig" och växlar automatiskt till steg-baserad synk.
Mindre batteridrift: På gymmet kan man stänga av GPS (som drar mycket ström) och bara köra på stegsensorn.
Användarvänlighet: Du kan nu marknadsföra appen med: "Fungerar lika bra i skogen som på gymmet."
Nästa steg:
Jag rekommenderar att vi lägger till en liten ikon i UI:t (en liten sko eller en satellit) som visar om appen just nu synkar mot GPS eller Steg. Det ger användaren förtroende för att tekniken fungerar även om de står still på ett löpband.

Det är grundläggande att den psykologiska grunden är förstådd. Vi använder musiken som en biometrisk feedback-loop:
För joggaren: Musiken är belöningen. När man saktar ner "straffas" man av att musiken segar ihop, vilket tvingar fram en instinktiv ökning av takten.
För bilisten: Musiken är varningssignalen. När man kör för fort blir den obehaglig (falsett), vilket tvingar fram en sänkning för att återställa harmonin.
Här är den tekniska implementationen som nu inkluderar både stegräkning för gym och den specifika motivations-algoritmen.

1. Uppdaterad TrackingService.kt (Stegräkning & Sensorer)
Vi lägger till stöd för TYPE_STEP_DETECTOR för att hantera löpband på gym.

code
Kotlin
// Lägg till i TrackingService.kt
private var stepDetector: Sensor? = null
private var stepListener: SensorEventListener? = null
private var lastStepTime = 0L
private var currentSpm = 0f // Steps Per Minute

private fun startStepDetection() {
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepDetector = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)

    stepListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            val now = System.currentTimeMillis()
            if (lastStepTime > 0) {
                val delta = now - lastStepTime
                // Beräkna kadens (SPM)
                val spm = 60000f / delta 
                if (spm in 40f..240f) { // Filtrera brus
                    currentSpm = spm
                    updatePlaybackBasedOnMovement()
                }
            }
            lastStepTime = now
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    sensorManager?.registerListener(stepListener, stepDetector, SensorManager.SENSOR_DELAY_FASTEST)
}

private fun updatePlaybackBasedOnMovement() {
    val speedKmh = lastSpeedMps?.times(3.6f) ?: 0f
    
    // Välj källa: Om GPS-fart är mycket låg men steg tas -> använd steg (Gym-läge)
    val movementInput = if (speedKmh < 2.0f && currentSpm > 40f) {
        "CADENCE" 
    } else {
        "SPEED"
    }
    
    // Skicka till ViewModel för beräkning av "Motivation/Varning"
    trackingRepository.emitMovementData(speedKmh, currentSpm, movementInput)
}

2. Motivations-algoritmen i ViewModels
För Joggaren (JoggerDashboardViewModel.kt)
Här är målet att hålla 1.0x hastighet. Saktar man ner, saktar musiken ner.

code
Kotlin
private fun calculateJoggerRate(speedKmh: Float, spm: Float, mode: String): Float {
    val targetSpeed = 10.0f // Målfart km/h
    val targetSpm = 160f    // Målkadens för gym
    
    val ratio = if (mode == "SPEED") {
        speedKmh / targetSpeed
    } else {
        spm / targetSpm
    }

    // Om man springer saktare än målet -> Musiken sackar efter (ner till 0.7x)
    // Om man springer snabbare -> Musiken stannar på 1.0x (belöningen är perfekt ljud)
    return ratio.coerceIn(0.7f, 1.0f) 
}
För Bilisten (DriverDashboardViewModel.kt)
Här är Cohen-i-falsett-logiken. Överträds gränsen ökar vi hastigheten/pitchen dramatiskt.
code
Kotlin
private fun calculateDriverRate(currentSpeedMph: Float, speedLimitMph: Float): Float {
    if (currentSpeedMph <= speedLimitMph) {
        return 1.0f // Baryton - perfekt Cohen
    }

    // Om vi kör för fort: Öka hastigheten (falsett-effekt)
    // Exempel: 10 MPH för fort -> 1.25x hastighet (Cohen i falsett)
    val overspeed = currentSpeedMph - speedLimitMph
    val penalty = 1.0f + (overspeed / 40f) 
    
    return penalty.coerceIn(1.0f, 1.5f)
}

3. Uppdaterade Behörigheter (AndroidManifest.xml)
För stegräknaren krävs en extra rad på moderna telefoner:

code
Xml
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />

4. Layout-komplettering (res/layout/activity_jogger_dashboard.xml)
Vi lägger till en visuell indikator för om det är GPS eller Steg (Gym) som driver musiken.

code
Xml
<!-- Inuti din Jogger Layout -->
<LinearLayout
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:layout_gravity="center">

    <ImageView
        android:id="@+id/ivMovementSource"
        android:layout_width="24dp"
        android:layout_height="24dp"
        android:src="@drawable/ic_satellite" /> <!-- Byt till ic_shoe i kod om Gym-läge -->

    <TextView
        android:id="@+id/txtMovementSource"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="8dp"
        android:text="GPS-synk"
        android:textColor="#FFFFFF" />
</LinearLayout>

Genom att använda GitHub Actions (CI/CD) slipper vi krånglet med lokala installationer och kan få en färdig APK-fil direkt från molnet.
För att vår "build.yml" ska fungera och för att integrera den nya logiken för stegräkning och motivations-ljud, behöver vi organisera projektet så att Gradle förstår strukturen.
Här är de sista komponenterna vi behöver lägga till i mitt repository för att bygget ska gå igenom och appen ska fungera som det är tänkt:

1. Uppdaterad projektstruktur
GitHub-workflowet förväntar sig en standardstruktur. Se till att filerna ligger så här:

code
Text
/ (root)
├── app/
│   ├── src/main/java/com/asoundapproach/app/ (Alla .kt filer)
│   ├── src/main/res/layout/ (Alla .xml filer)
│   └── build.gradle.kts
├── build.gradle.kts
├── settings.gradle.kts
└── local.properties (Skapas av CI eller läggs i Secrets)

2. Motivations-logiken i TrackingService.kt
Här implementerar vi append unika vision: att joggare saktas ner (motivation) och bilister speedas upp (varning/falsett).
Ersätt eller uppdatera funktionen applyPlaybackSpeed i TrackingService.kt:

code
Kotlin
private fun applyPlaybackSpeed(speed: Float) {
    val player = mediaPlayer ?: return
    if (!isAudioPrepared) return

    val settings = preferencesStore.getSettings()
    val isDriverMode = currentModeName?.contains("Driver", ignoreCase = true) == true
    
    val finalRate: Float
    val finalPitch: Float

    if (isDriverMode) {
        // BILIST-LOGIK: "Cohen i falsett"
        // Om speed (hastighet i MPH) > gräns, öka tempo och pitch
        val limit = statutorySpeedLimitMph ?: 75f
        if (speed > limit) {
            val overspeedFactor = (speed - limit) / 20f // Ökar gradvis
            finalRate = (1.0f + overspeedFactor).coerceIn(1.0f, 1.5f)
            finalPitch = (1.0f + overspeedFactor).coerceIn(1.0f, 1.5f) // Skapar falsett
        } else {
            finalRate = 1.0f
            finalPitch = 1.0f // Normal baryton
        }
    } else {
        // JOGGAR-LOGIK: Motivation genom fartminskning
        // Här antar vi att 'speed' är en ratio (0.0 till 1.0) från ViewModel
        // 1.0 = Målfart nådd. < 1.0 = Saktare tempo.
        finalRate = speed.coerceIn(0.7f, 1.0f)
        finalPitch = 1.0f // Behåll tonhöjd men sakta ner takten
    }

    try {
        val params = PlaybackParams().apply {
            setSpeed(finalRate)
            setPitch(finalPitch)
        }
        player.playbackParams = params
    } catch (e: Exception) {
        // Logga fel om enheten inte stöder variabel hastighet
    }
}

3. Stegräknare för Gym-läge
I JoggerDashboardViewModel.kt, lägg till hantering av stegsensorn för att stödja löpband:

code
Kotlin
// I init-blocket eller startTracking
private fun startGymMode() {
    val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
    if (stepSensor != null) {
        val stepListener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                // Beräkna SPM (Steps Per Minute)
                // Om SPM är högt men GPS-fart är 0, skicka "fart-ratio" baserat på steg
                val spm = calculateCurrentSpm() 
                val targetSpm = 160f
                val motivationRatio = (spm / targetSpm).coerceIn(0.7f, 1.0f)
                _events.tryEmit(JoggerDashboardEvent.UpdatePlaybackSpeedCommand(motivationRatio))
            }
            override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        sensorManager.registerListener(stepListener, stepSensor, SensorManager.SENSOR_DELAY_UI)
    }
}

4. Justering av din GitHub Build (build.yml)
YAML-filen är nästan perfekt, men för att den ska fungera med Android-projekt krävs ofta att man ger körrättigheter till Gradle-wrapper-filen. Lägg till detta steg innan Build debug APK:

code
Yaml
- name: Grant execute permission for gradlew
        run: chmod +x ${{ inputs.project_path }}/gradlew

      - name: Build debug APK
        working-directory: ${{ inputs.project_path }}
        run: ./gradlew assembleDebug --no-daemon
        
Notera: Jag ändrade gradle assembleDebug till ./gradlew assembleDebug. Det är säkrare eftersom det använder projektets specifika Gradle-version istället för GitHubs förinstallerade.

