import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
// import { selectTrains } from '../../store/Selectors/filterSelectors';
import { useNavigate } from 'react-router-dom';
import {selectUser} from'../../store/Selectors/authSelectors';
import { selectSearchParams, selectStations, selectTrains, selectLoading, selectTrainsSchedule } from '../../store/Selectors/filterSelectors';
// import { selectSearchParams } from '../../store/Selectors/filterSelectors';
import SkeletonLoader from './trainsSkeletonCode';
import Modal from './Modal';
import { fetchTrainSchedule } from '../../store/Actions/filterActions';
import { useDispatch } from 'react-redux';

const TrainSearchResultList = ({ filters }) => {
  const navigate = useNavigate();
  const isAuthenticated = useSelector(selectUser);
  const stationsList = useSelector(selectStations);
  const loading = useSelector(selectLoading);
  let searchParams = useSelector(selectSearchParams);
  let trainData = useSelector(selectTrains);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTrainNumber, setSelectedTrainNumber] = useState(null);
  const dispatch = useDispatch();
  
  if (trainData?.length === 0 ) { 
    console.log('No trains found in the store. Checking localStorage...');
    trainData = JSON.parse(localStorage.getItem('trains') || '[]');
    searchParams = JSON.parse(localStorage.getItem('trainSearchParams'));
  }
  
  let {formattedTrainDate, date } = searchParams;  



  const totalDuration = (duration) => {
    // Split the duration into hours and minutes
    const [hours, minutes] = duration?.split(':').map((timePart) => parseInt(timePart, 10));
  
    return hours > 0 ?  `${hours}h ${minutes}min` : `${minutes}min`;
  }

  const getStationName = (stationCode) => {
    const station = stationsList?.find((stn) => stn?.split(" - ")[1] === stationCode);
    return station?.split(" - ")[0];
  }

  const convertTo12HourFormat = (time) => {
    const [hours, minutes] = time?.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 || 12; // Convert 0 to 12 for 12-hour format
    return `${formattedHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const  calculateArrival = (trainObj, journeyDate) => {
    const { departureTime, duration } = trainObj;
  
    // Parse the journeyDate into a Date object
    const dateObj = new Date(journeyDate);
  
    // Extract hours and minutes from departureTime
    const [depHours, depMinutes] = departureTime?.split(':').map(Number);
    dateObj.setHours(depHours, depMinutes, 0, 0); // Set the departure time
  
    // Extract hours and minutes from duration
    const [durHours, durMinutes] = duration?.split(':').map(Number);
  
    // Add duration to the Date object
    dateObj.setHours(dateObj.getHours() + durHours);
    dateObj.setMinutes(dateObj.getMinutes() + durMinutes);
  
    // Format the arrival time as "HH:MM AM/PM"
    const formattedArrivalTime = dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  
    // Format the arrival date as "Day, DD MON"
    const formattedArrivalDate = dateObj.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }); // Convert month to uppercase if required
  
    return { formattedArrivalTime, formattedArrivalDate } ;
  }

  const getTrainArrival = (train, date, type) => {
    const { formattedArrivalTime, formattedArrivalDate } = calculateArrival(train, date);
    return type === 'time' ? formattedArrivalTime : formattedArrivalDate;
  }

  // let filteredTrainData = filteredTrainData ? [] : localStorage.getItem('trains')
  const filteredTrainData = useMemo(() => {
    const applyFilters = (trains, filters) => {
      const noClassSelected = Object.keys(filters).every(
        key => !["1A", "2A", "3A", "3E", "SL"].includes(key) || !filters[key]
      );
  
      // If no classes are selected and a quota is selected, return all availabilities that match the quota
      if (noClassSelected && filters.quota) {
        return trains?.filter(train => {
          const filteredAvailabilities = train.availabilities?.filter(avl => avl.quota === filters.quota);
          
          // Only include the train if there is at least one availability matching the quota
          if (filteredAvailabilities?.length > 0) {
            train.availabilities = filteredAvailabilities; // Update availabilities to only match the quota
            return true;
          }
          return false;
        });
      }
  
      // If no classes are selected and no quota filter is applied, return all trains
      if (noClassSelected) {
        return trains;
      }
  
      return trains?.filter(train => {
        let isMatch = true;
  
        const departureHour = parseInt(train?.departureTime?.split(":")[0], 10);
        const arrivalHour = parseInt(train?.arrivalTime?.split(":")[0], 10);
  
        const filteredAvailabilities = train.availabilities?.filter(avl => {
          const seatClass = avl.enqClass;
  
          // Check if seatClass matches any of the selected class filters
          const isClassMatch =
            (filters["1A"] && seatClass === "1A") ||
            (filters["2A"] && seatClass === "2A") ||
            (filters["3A"] && seatClass === "3A") ||
            (filters["3E"] && seatClass === "3E") ||
            (filters["SL"] && seatClass === "SL");
  
          // Check if quota matches the selected quota
          const isQuotaMatch = filters.quota ? avl.quota === filters.quota : true;
  
          // Return true only if both class and quota match
          return isClassMatch && isQuotaMatch;
        });
  
        // If no filteredAvailabilities match, exclude this train
        if (!filteredAvailabilities || filteredAvailabilities.length === 0) {
          return false;
        }
  
        // Filter based on AC classes if applicable
        if (filters.ac) {
          isMatch = isMatch && filteredAvailabilities.some(avl =>
            ["1A", "2A", "3A", "3E", "CC", "EC"].includes(avl.enqClass)
          );
        }
  
        // Filter based on departure times
        if (filters.departureEarlyMorning) {
          isMatch = isMatch && departureHour >= 0 && departureHour < 6;
        }
        if (filters.departureMorning) {
          isMatch = isMatch && departureHour >= 6 && departureHour < 12;
        }
        if (filters.departureMidDay) {
          isMatch = isMatch && departureHour >= 12 && departureHour < 18;
        }
        if (filters.departureNight) {
          isMatch = isMatch && departureHour >= 18 && departureHour < 24;
        }
  
        // Filter based on arrival times
        if (filters.arrivalEarlyMorning) {
          isMatch = isMatch && arrivalHour >= 0 && arrivalHour < 6;
        }
        if (filters.arrivalMorning) {
          isMatch = isMatch && arrivalHour >= 6 && arrivalHour < 12;
        }
        if (filters.arrivalMidDay) {
          isMatch = isMatch && arrivalHour >= 12 && arrivalHour < 18;
        }
        if (filters.arrivalNight) {
          isMatch = isMatch && arrivalHour >= 18 && arrivalHour < 24;
        }
  
        // Update train's availabilities with filtered results
        if (isMatch) {
          train.availabilities = filteredAvailabilities;
        }
  
        return isMatch;
      });
    };
    
    return applyFilters(trainData, filters);
  }, [trainData, filters]);

  console.log("Train data after filtered ", filteredTrainData);
  
  const handleBooking = (train) =>{
    console.log('Auth status:', isAuthenticated)
    if(isAuthenticated){
      navigate('/trainbookingdetails',{state:{ trainData: train}})
    }
    else{
      navigate('/login',{
        state:{
          redirectTo:'/trainbookingdetails',
          trainData:train,
        }
      });
    }
  }

  // console.log('181 filteredTrainData:', filteredTrainData);
  const stateData = useSelector((state) => state);
  console.log('217 stateData from train search result :', stateData);

  const getFormattedSeatsData = (train, index) => {
    
    const availabilityStatus = train.availabilities[index]?.avlDayList?.[0]?.availablityStatus;
    const availablityType = train.availabilities[index]?.avlDayList?.[0]?.availablityType;
    
    if (availablityType === "0" || availablityType === "4" || availablityType === "5" ) {
      return availabilityStatus;
    }else if (availablityType === "1") {
        let seats = parseInt(availabilityStatus.split('-')[1], 10);
        return seats ? `AVL ${seats}` : 'AVL';
    } else if (availablityType === "2" && availabilityStatus.includes("RAC")) {
        let seats = parseInt(availabilityStatus.split('RAC')[1], 10);
        return seats ? `RAC ${seats}` : "RAC";
    } else if (availablityType === "3" && availabilityStatus.includes("WL")) {
          let seats = parseInt(availabilityStatus.split('WL')[2], 10);
          return seats ? `WL ${seats}` : "WL";
    } else {
      return "NOT AVAILABLE";
    }
};

  // if (loading) {
  //   return (
  //     <div className="min-h-screen bg-gray-100 p-8">
  //       <div className="max-w-3xl mx-auto space-y-4">
  //         <SkeletonLoader />
  //       </div>
  //     </div>
  //   );
  // }
  // useEffect(() => {
  //   if (!loading) {
  //     const delayTimeout = setTimeout(() => setShowSkeleton(false), 4500); // Adjust delay as needed
  //     return () => clearTimeout(delayTimeout);
  //   }
  // }, [loading]);

  const openModel = useCallback((trainNumber) => {
    setSelectedTrainNumber(trainNumber);
    dispatch(fetchTrainSchedule(trainNumber)); 
    setIsModalOpen(true);
  }, [dispatch]);

  const closeModel = useCallback(() => {
    setIsModalOpen(false);
    setSelectedTrainNumber(null);
  }, []);

  return (
    <div className="row align-items-center g-4 mt-0">
      {/* Offer Coupon Box */}
      <div className="col-xl-12 col-lg-12 col-md-12">
        <div className="d-md-flex bg-success rounded-2 align-items-center justify-content-between px-3 py-3">
          <div className="d-md-flex align-items-center justify-content-start">
            <div className="mb-md-0 mb-3">
              <div className="square--60 circle bg-white">
                <i className="fa-solid fa-gift fs-3 text-success" />
              </div>
            </div>
            <div className="ps-2">
              <h6 className="fs-5 fw-medium text-light mb-0">Start Your Train Journey</h6>
              <p className="text-light mb-0">Book Train Tickets Easily and Enjoy Special Discounts with Our Platform</p>
            </div>
          </div>
          <div className="text-md-end mt-md-0 mt-4">
            <button type="button" className="btn btn-white fw-medium full-width text-dark px-xl-4">Get Started</button>
          </div>
        </div>
      </div>

      {/* Train list */}
      
    {
      //  loading && showSkeleton ? (
      //   <SkeletonLoader />
      // ) : 
      filteredTrainData?.length > 0 ? (
        filteredTrainData?.map(train => (
          <div key={train.trainNumber} className="col-xl-12 col-lg-12 col-md-12">
            <div className="train-availability-card bg-white rounded-3 p-4 hover-shadow" style={{ 
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
              transition: "all 0.3s ease",
              border: "1px solid #eee"
            }}> 
              <div className="row gy-4 align-items-center justify-content-between">
                {/* Train Info Header */}
                <div className="col-xl-12 col-lg-12 col-md-12">
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="train-name me-4">
                      <small>#{train.trainNumber}</small>
                      <h5 className="mb-2 fw-bold" style={{color: "#2c3e50"}}>{train.trainName}</h5>
                      <div className="text-muted small d-flex align-items-center">
                        <i className="fas fa-calendar-alt me-2"></i>
                        <b color='black'> Runs on: </b>
                        <span 
                          className="mx-1" 
                          style={{
                            fontWeight: train?.runningSun === "Y" ? 'bold' : 'normal',
                            color: train?.runningSun === "Y" ? '#d20000' : 'inherit',
                          }}
                        >
                          S
                        </span>
                        <span 
                          className="mx-1" 
                          style={{
                            fontWeight: train?.runningMon === "Y" ? 'bold' : 'normal',
                            color: train?.runningMon === "Y" ? '#d20000' : 'inherit',
                          }}
                        >
                          M
                        </span>
                        <span 
                          className="mx-1" 
                          style={{
                            fontWeight: train?.runningTue === "Y" ? 'bold' : 'normal',
                            color: train?.runningTue === "Y" ? '#d20000' : 'inherit',
                          }}
                        >
                          T
                        </span>
                        <span 
                          className="mx-1" 
                          style={{
                            fontWeight: train?.runningWed === "Y" ? 'bold' : 'normal',
                            color: train?.runningWed === "Y" ? '#d20000' : 'inherit',
                          }}
                        >
                          W
                        </span>
                        <span 
                          className="mx-1" 
                          style={{
                            fontWeight: train?.runningThu === "Y" ? 'bold' : 'normal',
                            color: train?.runningThu === "Y" ? '#d20000' : 'inherit',
                          }}
                        >
                          T
                        </span>
                        <span 
                          className="mx-1" 
                          style={{
                            fontWeight: train?.runningFri === "Y" ? 'bold' : 'normal',
                            color: train?.runningFri === "Y" ? '#d20000' : 'inherit',
                          }}
                        >
                          F
                        </span>
                        <span 
                          className="mx-1" 
                          style={{
                            fontWeight: train?.runningSat === "Y" ? 'bold' : 'normal',
                            color: train?.runningSat === "Y" ? '#d20000' : 'inherit',
                          }}
                        >
                          S
                        </span>
                      </div>
                    </div>

                    <div className="journey-details flex-grow-1 mx-4 p-3" style={{
                      background: "linear-gradient(to right,rgb(234, 245, 255), #ffffff,rgb(234, 245, 255)",
                      borderRadius: "12px"
                    }}>
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="text-center">
                          <div className="text-primary fw-bold" style={{fontSize: "0.8rem"}}>{getStationName(train.fromStnCode)}</div>
                          <div className="h4 mb-0 ">{convertTo12HourFormat(train.departureTime)}</div>
                          <div className="text-black-50">{formattedTrainDate}</div>
                        </div>

                        <div className="flex-grow-1 px-4">
                          <div className="journey-line position-relative">
                            <div className="duration text-center mb-2">
                              <span 
                                className="badge bg-light text-dark px-3 py-2" 
                                style={{boxShadow: "0 2px 4px rgba(0,0,0,0.4)"}}
                              >
                                {totalDuration(train.duration)}
                              </span>
                            </div>
                            <div className="line d-flex align-items-center" style={{
                              height: "2px",
                              position: "relative"
                            }}>
                              {/* Start dot */}
                              <div style={{
                                width: "8px",
                                height: "8px",
                                backgroundColor: "#333333",
                                borderRadius: "50%",
                                position: "absolute",
                                left: "-4px",
                                zIndex: "1"
                              }}></div>
                              {/* Connecting line */}
                              <div style={{
                                height: "2px",
                                flex: "1",
                                backgroundColor: "#e0e0e0"
                              }}></div>
                              {/* End dot */}
                              <div style={{
                                width: "8px",
                                height: "8px",
                                backgroundColor: "#333333",
                                borderRadius: "50%",
                                position: "absolute",
                                right: "-4px",
                                zIndex: "1"
                              }}></div>
                            </div>
                            <div className="view-route text-center mt-2">
                            <button
                              className="badge bg-light text-danger px-3 py-2"
                              style={{ boxShadow: "0 2px 4px rgba(36, 36, 36, 0.49)",border:'none',fontWeight : "bold"}}
                              onClick={() => openModel(train.trainNumber)} // Use callback function
                            >
                              View Route
                            </button>
                            <Modal isOpen={isModalOpen} onClose={closeModel} trainNumber={selectedTrainNumber} /> 
                          </div>



                          </div>
                        </div>

                        <div className="text-center">
                          <div className="text-primary fw-bold" style={{fontSize: "0.8rem"}}>{getStationName(train.toStnCode)}</div>
                          <div className="h4 mb-0 ">{getTrainArrival(train,date,"time")}</div>
                          <div className="text-black-50">{getTrainArrival(train,date,"date")}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                    {/* <button className="btn btn-primary px-1 py-1" style={{
                      background: "linear-gradient(45deg, #2196F3, #1976D2)",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px rgba(33, 150, 243, 0.3)"
                    }}>
                      <i className="fas fa-ticket-alt me-2"></i>
                      Availability
                      train.availabilities?.[0].avlDayList?.[0]?.availabilityStatus === "TRAIN DEPARTED" 
                    </button> */}

                <div className="w-100 border-top my-2 opacity-25"></div>
                <div className="col-xl-12 col-lg-12 col-md-12">
                  <div className="row text-center g-3 justify-content-start">
                    {train.availabilities?.[0]?.avlDayList?.[0]?.availablityStatus === "TRAIN DEPARTED" ? (
                      <div
                        style={{
                          width: "100%",
                          backgroundColor: "#F1F5F8",
                          color: "gray",
                          fontWeight :"bold",
                          textAlign: "center",
                          fontSize:"1.1rem",
                          padding: "5px",
                          borderRadius: "10px",
                        }}
                      >
                        TRAIN DEPARTED
                      </div>
                      ) : (
                      train.availabilities?.map((cls, index) => (
                        <div key={index} className="col-auto">
                          <div
                            className="availability-card p-2 position-relative"
                            style={{
                              minWidth: "140px",
                              background:
                                train.availabilities[index]?.avlDayList?.[0]?.availablityType === "1" ||
                                train.availabilities[index]?.avlDayList?.[0]?.availablityType === "2"
                                  ? "linear-gradient(125deg, #e8f5e9, #F2F7EC)"
                                  : train.availabilities[index]?.avlDayList?.[0]?.availablityType === "3"
                                  ? "linear-gradient(145deg, #fff3e0,rgb(249, 231, 204))"
                                  : "linear-gradient(145deg, rgb(247, 247, 247), rgb(255, 255, 255))",
                              border: `0.3px solid ${
                                train.availabilities[index]?.avlDayList?.[0]?.availablityType === "1" ||
                                train.availabilities[index]?.avlDayList?.[0]?.availablityType === "2"
                                  ? "green"
                                  : train.availabilities[index]?.avlDayList?.[0]?.availablityType === "3"
                                  ? "orange"
                                  : "gray"
                              }`,
                              borderRadius: "10px",
                              cursor: "pointer",
                              transition: "transform 0.2s ease",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                            }}
                            onClick={() => handleBooking(train)}
                          >
                            { (train.availabilities[index]?.quota === "TQ" || train.availabilities[index]?.quota === "PT") && (
                              <div
                                className="position-absolute badge bg-danger"
                                style={{
                                  top: "-10px",
                                  right: "10px",
                                  fontSize: "0.7rem",
                                  padding: "4px 8px",
                                  zIndex: "1",
                                }}
                              >
                              {train.availabilities[index]?.quota === "TQ" ? "TATKAL" : "PREMIUM"}                              </div>
                            )}
                            <div className="d-flex justify-content-between align-items-center">
                              <h6 className="mb-0 " style={{ color: "black" }}>
                                {train.availabilities[index]?.enqClass}
                              </h6>
                              {train.availabilities[index]?.totalFare > 0 && (
                                <div className="price">₹ {train.availabilities[index]?.totalFare}</div>
                              )}
                            </div>
                            <div className="availability">
                              <b
                                style={{
                                  fontSize: "1.1rem",
                                  color:
                                    train.availabilities[index]?.avlDayList?.[0]?.availablityType === "1" ||
                                    train.availabilities[index]?.avlDayList?.[0]?.availablityType === "2"
                                      ? "green"
                                      : train.availabilities[index]?.avlDayList?.[0]?.availablityType === "3"
                                      ? "#E86716"
                                      : "gray",
                                }}
                              >
                                {getFormattedSeatsData(train, index)}
                              </b>
                              <div
                                className="status-badge mb-1"
                                style={{
                                  color: cls.availableSeats ? "#2e7d32" : "#c62828",
                                  fontSize: "0.7rem",
                                }}
                              >
                                {(train.availabilities[index]?.avlDayList?.[0]?.availablityType === "1" ||
                                train.availabilities[index]?.avlDayList?.[0]?.availablityType === "2") ? (
                                  <span style={{ color: "green", display: "flex", alignItems: "center" }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="15" viewBox="0 0 24 24">
                                      <path fill="green" d="M12 2L1 5v7c0 8 5 12 11 12s11-4 11-12V5l-11-3z" />
                                      <path fill="white" d="M14 16.2l-3.4-3.4 1.4-1.4L9 13.4l6.6-6.6 1.4 1.4z" />
                                    </svg>
                                    <span style={{ marginLeft: "5px" }}>Travel Guarantee</span>
                                  </span>
                                ) : train.availabilities[index]?.avlDayList?.[0]?.availablityType === "3" ? (
                                  "50% chances"
                                ) : (
                                  "."
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="col-12 text-center mt-5">
          <div className="no-train-found-wrapper">
            <i className="fas fa-train fa-5x text-muted mb-3"></i>
            <h3 className="text-muted">No Trains Found Between These Stations</h3>
            <p className="text-muted">Please try adjusting your search filters or check back later for updated results.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainSearchResultList;
